import test from "node:test";
import assert from "node:assert/strict";
import { getCombatantData, normalizeTicks, setTicks } from "../../src/tick/data.js";
import { groupTimeline } from "../../src/tick/timelineView.js";
import { canRollInitiative, rollInitiative, validateInitiativeValues } from "../../src/tick/initiative.js";
import { refreshTokenHighlight } from "../../src/tick/tokenHighlights.js";
import { setTimelineApp } from "../../src/tick/state.js";

function encounter(ticks, { started = true, events = [], waiting = [] } = {}) {
  const writes = [];
  const combat = {
    started, flags: { events, totalTicks: 0 },
    getFlag(_scope, key) { return this.flags[key]; },
    async update(changes, options) {
      if (options?.parent) {
        throw new Error("Combat is not a valid embedded Document within the Combat Document");
      }
      writes.push({ changes, options });
      for (const [key, value] of Object.entries(changes)) this.flags[key.split(".").at(-1)] = value;
    },
    async updateEmbeddedDocuments(type, updates, options) {
      assert.equal(type, "Combatant");
      // Foundry adds the owning document to the supplied operation object.
      options.parent = this;
      writes.push({ updates, options });
      for (const update of updates) {
        this.combatants.find(item => item.id === update._id).data = update["flags.ucurifunke.data"];
        // Model Foundry's per-document hooks firing within a batch.
        if (!options?.tickCombatNormalization) void normalizeTicks(this);
      }
    }
  };
  combat.combatants = ticks.map((ticks, index) => ({
    id: String(index), name: String(index), parent: combat, isOwner: true,
    data: JSON.stringify({ ticks, isWaiting: waiting.includes(index) }),
    pending: {},
    getFlag(_scope, key) { return key === "pendingTicks" ? this.pending : this.data; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "flags.ucurifunke.data") this.data = value;
        else if (key.startsWith("flags.ucurifunke.pendingTicks.-=")) delete this.pending[key.split("-=")[1]];
      }
    },
    async setFlag(_scope, _key, value) { this.data = value; }
  }));
  globalThis.game = {
    combat, combats: [combat], user: { id: "gm", isGM: true },
    users: { activeGM: { id: "gm" } }
  };
  return { combat, writes, values: () => combat.combatants.map(item => getCombatantData(item).ticks) };
}

test("initiative remains absolute before combat starts", async () => {
  const { combat, values, writes } = encounter([19, 23], { started: false });
  await normalizeTicks();
  assert.deepEqual(values(), [19, 23]);
  assert.equal(writes.length, 0);
  combat.started = true;
  await normalizeTicks();
  assert.deepEqual(values(), [0, 4]);
  assert.equal(combat.flags.totalTicks, 19);
});

test("bookings arriving during a normalization survive and are consumed exactly once", async () => {
  const { combat, values } = encounter([0, 0]);
  const [attacker, defender] = combat.combatants;
  attacker.pending.attack = 7;
  defender.pending.parry = 5;
  const update = combat.updateEmbeddedDocuments.bind(combat);
  let next;
  combat.updateEmbeddedDocuments = async (...args) => {
    if (!next) {
      attacker.pending.anotherAttack = 4;
      next = normalizeTicks(combat);
    }
    await update(...args);
  };
  await normalizeTicks(combat);
  await next;
  await normalizeTicks(combat);
  assert.equal(combat.flags.totalTicks, 5);
  assert.deepEqual(values(), [6, 0]);
  assert.deepEqual(attacker.pending, {});
  assert.deepEqual(defender.pending, {});
});

test("German normalization uses the Combatant type and keeps update operations separate", async () => {
  const { combat, values, writes } = encounter([2, 5, 6, 16]);
  globalThis.game.settings = { get: () => "de" };
  await normalizeTicks();
  assert.deepEqual(values(), [0, 3, 4, 14]);
  assert.equal(combat.flags.totalTicks, 2);
  assert.equal(writes[0].options.parent, combat);
  assert.equal(Object.hasOwn(writes[1].options, "parent"), false);

  await setTicks(combat.combatants[0], 32);
  await Promise.all([normalizeTicks(), normalizeTicks()]);
  assert.deepEqual(values(), [29, 0, 1, 11]);
  assert.equal(combat.flags.totalTicks, 5);
});

test("loading a started German encounter recovers its initial tick offset once", async () => {
  const { combat, values } = encounter([4, 13, 20]);
  const hooks = new Map();
  globalThis.Hooks = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
  globalThis.foundry = {
    utils: { hasProperty: (data, path) => path.split(".").reduce((value, key) => value?.[key], data) !== undefined },
    applications: { api: {
    ApplicationV2: class { async render() {} setPosition() {} },
    HandlebarsApplicationMixin: Base => Base
  } } };
  game.settings = { get: (_scope, key) => key === "language" ? "de" : 1 };
  try {
    await import("../../src/tick/main.js");
    await hooks.get("ready")();
    assert.deepEqual(values(), [0, 9, 16]);
    assert.equal(combat.flags.totalTicks, 4);
    await normalizeTicks();
    assert.equal(combat.flags.totalTicks, 4);

    // The active GM must normalize when another GM advances the last event at tick zero.
    combat.combatants[0].data = JSON.stringify({ ticks: 3 });
    combat.flags.events = [{ id: "remote-event", isEvent: true, ticks: 12 }];
    const update = { flags: { ucurifunke: { events: combat.flags.events } } };
    await hooks.get("updateCombat")(combat, update, { tickCombatNormalization: true });
    assert.equal(combat.flags.totalTicks, 4);
    await hooks.get("updateCombat")(combat, update, {});
    assert.deepEqual(values(), [0, 6, 13]);
    assert.equal(combat.flags.totalTicks, 7);
  } finally {
    setTimelineApp(null);
    delete globalThis.Hooks;
    delete globalThis.foundry;
  }
});

test("a tied group advances once, repeated concurrent requests do not double count", async () => {
  const { combat, values } = encounter([0, 0, 4, 7]);
  await setTicks(combat.combatants[0], 8);
  await normalizeTicks();
  assert.equal(combat.flags.totalTicks, 0);
  await setTicks(combat.combatants[1], 8);
  await Promise.all([normalizeTicks(), normalizeTicks(), normalizeTicks()]);
  assert.deepEqual(values(), [4, 4, 0, 3]);
  assert.equal(combat.flags.totalTicks, 4);
});

test("waiting combatants stay at zero and do not block elapsed time", async () => {
  const { combat, values } = encounter([0, 4, 7], { waiting: [0] });
  await normalizeTicks();
  assert.deepEqual(values(), [0, 0, 3]);
  assert.equal(combat.flags.totalTicks, 4);
});

test("all events move together, including hidden events, and count one time step", async () => {
  const { combat, values, writes } = encounter([7, 9], {
    events: [{ id: "a", isEvent: true, ticks: 4, isHidden: true },
      { id: "b", isEvent: true, ticks: 12 }]
  });
  await normalizeTicks();
  assert.deepEqual(values(), [3, 5]);
  assert.deepEqual(combat.flags.events.map(event => event.ticks), [0, 8]);
  assert.equal(combat.flags.totalTicks, 4);
  assert.ok(writes.every(write => write.options.tickCombatNormalization));
});

test("other GMs and players never normalize", async () => {
  const { values, writes } = encounter([4, 7]);
  game.user.id = "other-gm";
  await normalizeTicks();
  game.user.isGM = false;
  await normalizeTicks();
  assert.deepEqual(values(), [4, 7]);
  assert.equal(writes.length, 0);
});

test("corrections cannot reduce total elapsed ticks", async () => {
  const { combat, values } = encounter([-2, 4]);
  combat.flags.totalTicks = 10;
  await normalizeTicks();
  assert.deepEqual(values(), [0, 6]);
  assert.equal(combat.flags.totalTicks, 10);
});

test("normalization remains attached to its encounter when the active encounter changes", async () => {
  const first = encounter([5, 8]);
  const second = encounter([0, 3]);
  await normalizeTicks(first.combat);
  assert.deepEqual(first.values(), [0, 3]);
  assert.equal(first.combat.flags.totalTicks, 5);
  assert.equal(second.combat.flags.totalTicks, 0);
});

test("three distinct tick groups include every tied combatant", () => {
  const items = [0, 0, 4, 7, 7, 9].map((ticks, id) => ({ id, ticks }));
  const result = groupTimeline(items, 3);
  assert.deepEqual(result.map(group => group.ticks), [0, 4, 7]);
  assert.deepEqual(result.map(group => group.items.length), [2, 1, 2]);
  assert.equal(groupTimeline(items).length, 4);
});

test("events do not consume combatant slots, waiting combatants remain accessible", () => {
  const items = [
    { ticks: 0, isWaiting: true }, { ticks: 2, isEvent: true },
    { ticks: 4 }, { ticks: 7 }, { ticks: 9 }, { ticks: 12 },
    { ticks: 15, isEvent: true }
  ];
  assert.deepEqual(groupTimeline(items, 3).map(group => group.ticks), [0, 2, 4, 7, 9]);
});

test("initiative accepts zero and rejects negative, fractional, or invalid values", () => {
  assert.equal(validateInitiativeValues(0, 0), true);
  assert.equal(validateInitiativeValues(12, 3), true);
  for (const invalid of [-1, 0.5, NaN, Infinity, "2", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validateInitiativeValues(invalid, 0), false);
    assert.equal(validateInitiativeValues(0, invalid), false);
  }
});

test("initiative is restricted to GM or owner before combat starts", () => {
  const { combat } = encounter([0], { started: false });
  const actor = combat.combatants[0];
  assert.equal(canRollInitiative(actor), true);
  game.user.isGM = false;
  assert.equal(canRollInitiative(actor), true);
  actor.isOwner = false;
  assert.equal(canRollInitiative(actor), false);
  game.user.isGM = true;
  combat.started = true;
  assert.equal(canRollInitiative(actor), false);
});

test("initiative evaluates the requested formula and writes the initial tick value", async () => {
  const { combat, values } = encounter([0], { started: false });
  globalThis.document = { createElement: () => ({
    attributes: [],
    set className(value) { this.attributes.push({ name: "class", value }); }
  }) };
  globalThis.foundry = {
    applications: { api: { DialogV2: { input: async ({ content }) => {
      assert.equal(content.attributes.length, 0, "DialogV2 content must have no attributes");
      return { reaction: 12, impairment: 3 };
    } } } },
    dice: { Roll: class {
      constructor(formula, data) {
        assert.equal(formula, "30 - @reaction + @impairment - 1d6");
        this.total = 30 - data.reaction + data.impairment - 4;
      }
      async evaluate() { return this; }
    } }
  };
  await rollInitiative(combat.combatants[0]);
  assert.deepEqual(values(), [17]);
  combat.combatants[0].data = JSON.stringify({ ticks: 99, isWaiting: true });
  await rollInitiative(combat.combatants[0]);
  assert.deepEqual(values(), [17], "Reroll replaces the previous initial tick value");
  assert.equal(getCombatantData(combat.combatants[0]).isWaiting, false);
  foundry.applications.api.DialogV2.input = async () => {
    combat.started = true;
    return { reaction: 0, impairment: 0 };
  };
  await rollInitiative(combat.combatants[0]);
  assert.deepEqual(values(), [17]);
});

test("zero-tick outlines follow the timeline and restore native marker visibility", t => {
  const { combat } = encounter([0, 0, 5]);
  const timeline = { rendered: true, minimized: false };
  setTimelineApp(timeline);
  t.after(() => setTimelineApp(null));
  globalThis.PIXI = { Graphics: class {
    clear() {} lineStyle() {} drawRoundedRect() {}
  } };
  const tokens = combat.combatants.map((combatant, index) => {
    combatant.tokenId = String(index);
    combatant.sceneId = "scene";
    return {
      id: String(index), w: 100, h: 100, isVisible: true, controlled: false,
      document: { parent: { id: "scene" } }, children: [], turnMarker: { visible: true },
      addChild(child) { this.children.push(child); return child; }
    };
  });
  for (const token of tokens) refreshTokenHighlight(token);
  assert.deepEqual(tokens.map(token => Boolean(token.children[0]?.visible)), [true, true, false]);
  assert.ok(tokens.every(token => !token.controlled && !token.turnMarker.visible));
  timeline.rendered = false;
  for (const token of tokens) refreshTokenHighlight(token);
  assert.ok(tokens.every(token => !token.children[0]?.visible && token.turnMarker.visible));
  timeline.rendered = true;
  for (const token of tokens) refreshTokenHighlight(token);
  assert.deepEqual(tokens.map(token => Boolean(token.children[0]?.visible)), [true, true, false]);
  combat.combatants[0].data = JSON.stringify({ ticks: 3 });
  refreshTokenHighlight(tokens[0]);
  assert.equal(tokens[0].children[0].visible, false);
  combat.combatants[1].hidden = true;
  refreshTokenHighlight(tokens[1]);
  assert.equal(tokens[1].children[0].visible, false);
});
