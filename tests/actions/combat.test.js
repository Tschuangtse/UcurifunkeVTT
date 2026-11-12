import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ACTIONS, parseCost } from "../../src/actions/actions.js";
import { getSelection, addActionTicks } from "../../src/actions/combat.js";
import { ActionDock } from "../../src/actions/dock.js";

function fixture() {
  const combatant = { id: "combatant-a", tokenId: "token-a", sceneId: "scene-a", actor: { id: "shared-actor" } };
  const other = { id: "combatant-b", tokenId: "token-b", sceneId: "scene-a", actor: combatant.actor };
  const combat = { started: true, combatants: [combatant, other] };
  const game = { user: { isGM: true }, modules: new Map([["tick-combat", { active: true }]]), combat };
  const canvas = { ready: true, scene: { id: "scene-a" }, tokens: { controlled: [{ id: "token-a", document: { parent: { id: "scene-a" } } }] } };
  const calls = [];
  const loadApi = async () => ({
    getCombatantInfo: () => ({ ticks: 11 }),
    setTicks: async (...args) => calls.push(["set", ...args]),
    normalizeTicks: async (...args) => calls.push(["normalize", ...args])
  });
  return { game, canvas, combatant, calls, loadApi };
}

test("complete four-category catalogue and exact fixed rule costs", () => {
  assert.deepEqual(CATEGORIES.map(category => category.actions.length), [6, 5, 7, 10]);
  assert.equal(ACTIONS.size, 28);
  assert.equal(ACTIONS.get("parry").ticks, 4);
  assert.equal(ACTIONS.get("parry-maneuver").ticks, 8);
  assert.equal(ACTIONS.get("stand").ticks, 6);
  assert.equal(ACTIONS.get("turn").ticks, 1);
  assert.equal(ACTIONS.get("allow-hit").ticks, 0);
  for (const id of ["melee", "opportunity", "approach", "ram", "skill", "reload", "draw"]) {
    assert.equal(ACTIONS.get(id).ticks, null);
  }
});

test("aim books one four-tick step without opening a cost dialog", async () => {
  const f = fixture();
  const dock = new ActionDock({
    getGame: () => f.game, getCanvas: () => f.canvas,
    notify: message => assert.fail(message),
    costPrompt: () => assert.fail("Aiming has fixed costs"),
    applyTicks: (selection, ticks) => addActionTicks(selection, ticks, f)
  });
  dock.refresh = () => {};
  await dock.execute("aim");
  assert.deepEqual(f.calls, [["set", f.combatant, 15], ["normalize", f.game.combat]]);
});

test("manual cost input accepts zero and 32, rejects empty, fractional, and out-of-range input", () => {
  for (const value of [0, "0", 8, " 32 "]) assert.equal(parseCost(value), Number(value));
  for (const value of ["", " ", null, undefined, "abc", -1, 33, 2.5, Infinity]) assert.throws(() => parseCost(value));
});

test("selection uses the token, not a shared actor, and permits off-turn reactions", () => {
  const f = fixture();
  f.game.combat.turn = 1;
  assert.equal(getSelection(f.game, f.canvas).combatant, f.combatant);
  f.canvas.tokens.controlled = [{ id: "token-b" }];
  assert.equal(getSelection(f.game, f.canvas).combatant.id, "combatant-b");
});

for (const [name, mutate] of [
  ["player", f => { f.game.user.isGM = false; }],
  ["no encounter", f => { f.game.combat = null; }],
  ["unstarted encounter", f => { f.game.combat.started = false; }],
  ["canvas teardown", f => { f.canvas.ready = false; }],
  ["no selection", f => { f.canvas.tokens.controlled = []; }],
  ["multiple selection", f => { f.canvas.tokens.controlled.push({ id: "token-b" }); }],
  ["nonparticipant", f => { f.canvas.tokens.controlled = [{ id: "unknown" }]; }],
  ["wrong scene", f => { f.combatant.sceneId = "other-scene"; }],
  ["ambiguous participant", f => { f.game.combat.combatants.push({ ...f.combatant, id: "duplicate" }); }]
]) {
  test(`${name} prevents all tick writes`, async () => {
    const f = fixture();
    const expected = getSelection(f.game, f.canvas);
    mutate(f);
    assert.ok(getSelection(f.game, f.canvas).error);
    await assert.rejects(addActionTicks(expected, 4, f));
    assert.deepEqual(f.calls, []);
  });
}

test("adds to the existing value and delegates normalization to TickBasedCombat", async () => {
  const f = fixture();
  await addActionTicks(getSelection(f.game, f.canvas), 4, f);
  assert.deepEqual(f.calls, [["set", f.combatant, 15], ["normalize", f.game.combat]]);
});

test("players can book ticks for their owned token", async () => {
  const f = fixture();
  f.game.user.isGM = false;
  f.canvas.tokens.controlled[0].document.isOwner = true;
  await addActionTicks(getSelection(f.game, f.canvas), 4, f);
  assert.deepEqual(f.calls, [["set", f.combatant, 15]]);
});

test("unowned token shows the required warning before prompting for variable costs", async () => {
  const f = fixture();
  f.game.user.isGM = false;
  f.canvas.tokens.controlled[0].document.isOwner = false;
  const warnings = [];
  const dock = new ActionDock({
    getGame: () => f.game, getCanvas: () => f.canvas, notify: message => warnings.push(message),
    costPrompt: () => assert.fail("No dialog for an unowned token"),
    applyTicks: () => assert.fail("No tick write for an unowned token")
  });
  await dock.execute("melee");
  assert.deepEqual(warnings, ["Keine Berechtigung für diesen Akteur."]);
});

test("ownership revoked during a variable cost dialog prevents booking", async () => {
  const f = fixture();
  f.game.user.isGM = false;
  const document = f.canvas.tokens.controlled[0].document;
  document.isOwner = true;
  const expected = getSelection(f.game, f.canvas);
  document.isOwner = false;
  await assert.rejects(addActionTicks(expected, 8, f), { message: "Keine Berechtigung für diesen Akteur." });
  assert.deepEqual(f.calls, []);
});

test("zero ticks does not wake waiting combatants or advance time", async () => {
  const f = fixture();
  await addActionTicks(getSelection(f.game, f.canvas), 0, f);
  assert.deepEqual(f.calls, []);
});

test("changing selection in the dialog cannot charge another combatant", async () => {
  const f = fixture();
  const expected = getSelection(f.game, f.canvas);
  f.canvas.tokens.controlled = [{ id: "token-b" }];
  await assert.rejects(addActionTicks(expected, 8, f), /geändert/);
  assert.deepEqual(f.calls, []);
});

test("ending or switching combat while loading the dependency prevents writing", async () => {
  for (const change of [f => { f.game.combat.started = false; }, f => { f.game.combat = { ...f.game.combat }; },
    f => { f.game.user.isGM = false; }]) {
    const f = fixture();
    const original = f.loadApi;
    f.loadApi = async () => { change(f); return original(); };
    await assert.rejects(addActionTicks(getSelection(f.game, f.canvas), 8, f));
    assert.deepEqual(f.calls, []);
  }
});

test("failed persistence never calls normalization", async () => {
  const f = fixture();
  f.loadApi = async () => ({ getCombatantInfo: () => ({ ticks: 1 }),
    setTicks: async () => { throw new Error("write failed"); },
    normalizeTicks: async () => f.calls.push("unexpected") });
  await assert.rejects(addActionTicks(getSelection(f.game, f.canvas), 4, f), /write failed/);
  assert.deepEqual(f.calls, []);
});
