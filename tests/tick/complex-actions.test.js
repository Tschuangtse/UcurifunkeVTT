import test from "node:test";
import assert from "node:assert/strict";
import { advanceComplexAction, beginComplexAction, canAdvanceComplexAction, cancelComplexAction,
  getSelectedCombatant, promptComplexAction } from "../../src/tick/complexAction.js";
import { getCombatantData, getCombatantInfo, normalizeTicks, setNote, setTicks, toggleWaiting } from "../../src/tick/data.js";
import { isComplexActionDuration } from "../../src/tick/complexActionData.js";

function fixture({ started = false } = {}) {
  const warnings = [];
  const messages = [];
  globalThis.foundry = { documents: { ChatMessage: {
    getSpeaker: ({ alias }) => ({ alias }),
    async create(message) { messages.push(message); }
  } } };
  const combat = {
    started, flags: { events: [], totalTicks: 0 },
    getFlag(_scope, key) { return this.flags[key]; },
    async update(changes, options) {
      assert.equal(options.parent, undefined);
      for (const [key, value] of Object.entries(changes)) this.flags[key.split(".").at(-1)] = value;
    },
    async updateEmbeddedDocuments(type, updates, options) {
      assert.equal(type, "Combatant");
      options.parent = this;
      for (const update of updates) this.combatants.find(c => c.id === update._id).data = update["flags.ucurifunke.data"];
    }
  };
  combat.combatants = [0, 1].map(index => ({
    id: String(index), parent: combat, tokenId: "token" + index, sceneId: "scene",
    isOwner: true, data: JSON.stringify({ ticks: 0, notes: "Keep notes" }),
    getFlag() { return this.data; },
    async setFlag(_scope, _key, value) { this.data = value; }
  }));
  globalThis.game = { combat, user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } } };
  const token = { id: "token0", document: { parent: { id: "scene" } } };
  globalThis.canvas = { tokens: { controlled: [token] } };
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  globalThis.document = { createElement: () => ({ attributes: [] }) };
  return { combat, actor: combat.combatants[0], other: combat.combatants[1], token, warnings, messages };
}

test("durations must be safe whole multiples of eight, starting at eight", () => {
  for (const value of [8, 16, 24, 32, 800]) assert.equal(isComplexActionDuration(value), true);
  for (const value of [0, -8, 7, 9, 12, 8.5, NaN, Infinity, "16"]) assert.equal(isComplexActionDuration(value), false);
});

test("exactly one selected token must match both token and scene IDs", async () => {
  const { actor, token, warnings } = fixture();
  assert.equal(getSelectedCombatant(), actor);
  for (const selection of [[], [token, token], [{ id: "not-in-combat", document: token.document }],
    [{ id: token.id, document: { parent: { id: "different-scene" } } }]]) {
    canvas.tokens.controlled = selection;
    assert.equal(getSelectedCombatant(), null);
    assert.equal(await promptComplexAction(), false);
  }
  assert.equal(warnings.length, 4);
  assert.equal(getCombatantData(actor).complexAction, null);
});

test("beginning an action costs eight ticks and preserves the other combatant data", async () => {
  const { actor } = fixture();
  await setTicks(actor, 4);
  assert.equal(await beginComplexAction(actor, { name: "  Reload crossbow  ", duration: 32 }), true);
  assert.equal(getCombatantData(actor).ticks, 12);
  assert.equal(getCombatantData(actor).notes, "Keep notes");
  assert.deepEqual(getCombatantData(actor).complexAction, { name: "Reload crossbow", duration: 32, spent: 8 });
  assert.equal(await beginComplexAction(actor, { name: "Replace action", duration: 16 }), false);
});

test("a full 32 tick action completes immediately when the last interval is committed", async () => {
  const { actor, other, combat, messages } = fixture({ started: true });
  actor.name = "Lene";
  await beginComplexAction(actor, { name: "Ritual", duration: 32 });
  assert.equal(canAdvanceComplexAction(actor), false);
  assert.equal(await advanceComplexAction(actor), false);
  for (const spent of [16, 24, 32]) {
    await setTicks(other, 8);
    await normalizeTicks();
    assert.equal(getCombatantData(actor).ticks, 0);
    assert.equal(canAdvanceComplexAction(actor), true);
    assert.equal(await advanceComplexAction(actor), true);
    assert.equal(getCombatantData(actor).ticks, 8);
    if (spent < 32) assert.equal(getCombatantData(actor).complexAction.spent, spent);
  }
  assert.equal(getCombatantData(actor).complexAction, null);
  assert.equal(combat.flags.totalTicks, 24);
  assert.equal(await advanceComplexAction(actor), false);
  await setTicks(other, 8);
  await normalizeTicks();
  assert.equal(getCombatantData(actor).ticks, 0);
  assert.equal(combat.flags.totalTicks, 32);
  assert.deepEqual(messages.map(message => message.content), ["Lene finished the action Ritual."]);
});

test("an eight tick action immediately returns to normal with eight ticks scheduled", async () => {
  const { actor, messages } = fixture();
  assert.equal(await beginComplexAction(actor, { name: "Short action", duration: 8 }), true);
  assert.equal(getCombatantData(actor).ticks, 8);
  assert.equal(getCombatantData(actor).complexAction, null);
  assert.equal(messages.length, 1);
});

test("cancellation preserves scheduled ticks and posts one escaped message", async () => {
  const { actor, messages } = fixture();
  actor.name = "A & B";
  await beginComplexAction(actor, { name: "<Ritual>", duration: 32 });
  game.user.isGM = false;
  actor.isOwner = false;
  assert.equal(await cancelComplexAction(actor), false);
  assert.equal(messages.length, 0);
  actor.isOwner = true;
  assert.deepEqual(await Promise.all([cancelComplexAction(actor), cancelComplexAction(actor)]), [true, false]);
  assert.equal(getCombatantData(actor).ticks, 8);
  assert.equal(getCombatantInfo(actor).complexAction, null);
  assert.deepEqual(messages.map(message => message.content), ["A &amp; B cancelled the action &lt;Ritual&gt;."]);
});

test("concurrent clicks commit only one interval", async () => {
  const { actor } = fixture();
  await beginComplexAction(actor, { name: "Ritual", duration: 32 });
  await setTicks(actor, 0);
  assert.deepEqual(await Promise.all([advanceComplexAction(actor), advanceComplexAction(actor)]), [true, false]);
  assert.equal(getCombatantData(actor).complexAction.spent, 16);
  assert.equal(getCombatantData(actor).ticks, 8);
});

test("nonowners, defeated combatants and combatants in other encounters cannot begin actions", async () => {
  const { actor, combat } = fixture();
  game.user.isGM = false;
  actor.isOwner = false;
  assert.equal(await beginComplexAction(actor, { name: "Ritual", duration: 16 }), false);
  actor.isOwner = true;
  actor.isDefeated = true;
  assert.equal(await beginComplexAction(actor, { name: "Ritual", duration: 16 }), false);
  actor.isDefeated = false;
  game.combat = { combatants: [] };
  assert.equal(await beginComplexAction(actor, { name: "Ritual", duration: 16 }), false);
  game.combat = combat;
  assert.equal(await beginComplexAction(actor, { name: "Ritual", duration: 16 }), true);
});

test("stored progress survives reload and note edits, and blocks waiting", async () => {
  const { actor } = fixture();
  await beginComplexAction(actor, { name: "Ritual", duration: 32 });
  const reloaded = { ...actor, data: JSON.stringify(JSON.parse(actor.data)) };
  assert.deepEqual(getCombatantData(reloaded).complexAction, { name: "Ritual", duration: 32, spent: 8 });
  await setNote(actor, "Updated note");
  await setTicks(actor, 0);
  await toggleWaiting(actor);
  assert.equal(getCombatantData(actor).complexAction.spent, 8);
  assert.equal(getCombatantInfo(actor).canWait, false);
  assert.equal(getCombatantData(actor).isWaiting, false);
});

test("legacy combatants and malformed action data remain readable", () => {
  const { actor } = fixture();
  for (const action of [undefined, {}, { name: "Ritual", duration: 12, spent: 8 },
    { name: "Ritual", duration: 32, spent: -8 }, { name: "Ritual", duration: 32, spent: 32 }]) {
    actor.data = JSON.stringify({ ticks: 5, complexAction: action });
    assert.equal(getCombatantData(actor).ticks, 5);
    assert.equal(getCombatantData(actor).complexAction, null);
  }
});

test("dialog has attribute-free outer content and cancellation makes no changes", async () => {
  const { actor } = fixture();
  foundryStub(async ({ content }) => {
    assert.equal(content.attributes.length, 0);
    assert.equal(Object.hasOwn(content, "className"), false);
    return null;
  });
  assert.equal(await promptComplexAction(), false);
  assert.equal(getCombatantData(actor).ticks, 0);
  foundryStub(async () => ({ name: "Ritual", duration: 24 }));
  assert.equal(await promptComplexAction(), true);
  assert.deepEqual(getCombatantData(actor).complexAction, { name: "Ritual", duration: 24, spent: 8 });
});

test("invalid input or changing selection while the dialog is open does not modify ticks", async () => {
  const { actor, warnings } = fixture();
  for (const result of [{ name: "", duration: 16 }, { name: "Ritual", duration: 9 }]) {
    foundryStub(async () => result);
    assert.equal(await promptComplexAction(), false);
  }
  assert.equal(warnings.length, 2);
  foundryStub(async () => {
    canvas.tokens.controlled = [];
    return { name: "Ritual", duration: 16 };
  });
  assert.equal(await promptComplexAction(), false);
  assert.equal(getCombatantData(actor).ticks, 0);
});

function foundryStub(input) {
  globalThis.foundry.applications = { api: { DialogV2: { input } } };
}
