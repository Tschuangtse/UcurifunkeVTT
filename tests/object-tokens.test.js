import assert from "node:assert/strict";
import { test } from "node:test";
import { getSelection } from "../src/actions/combat.js";
import { setConditionField } from "../src/conditions.js";

const hooks = new Map();
globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
globalThis.CONST = { TOKEN_DISPLAY_MODES: { ALWAYS: 50 } };
globalThis.ui = { notifications: { warn() {} } };
const { refreshObjectBar } = await import("../src/object-tokens.js");

test("object creation configures the native structure bar and leaves character defaults alone", () => {
  const updates = [];
  hooks.get("preCreateActor")({ type: "object", updateSource: data => updates.push(data) }, {});
  assert.deepEqual(updates[0], { "prototypeToken.bar1.attribute": "structure", "prototypeToken.bar2.attribute": null, "prototypeToken.displayBars": 50 });
  updates.length = 0;
  hooks.get("preCreateToken")({ actor: { type: "object" }, updateSource: data => updates.push(data) });
  assert.equal(updates[0]["bar1.attribute"], "structure");
  updates.length = 0;
  hooks.get("preCreateActor")({ type: "character", updateSource: data => updates.push(data) }, {});
  assert.equal(updates.length, 0);
});

test("undamaged structure hides the bar, all damaged values including zero show it, and ordinary actor bars are unaffected", () => {
  const token = { actor: { type: "object", system: { structure: { value: 3 } } }, document: { bar1: { attribute: "structure" } }, bars: { bar1: { visible: true } } };
  refreshObjectBar(token);
  assert.equal(token.bars.bar1.visible, false);
  for (const value of [2, 1, 0]) {
    token.actor.system.structure.value = value;
    refreshObjectBar(token);
    assert.equal(token.bars.bar1.visible, true);
  }
  token.actor.type = "character";
  token.bars.bar1.visible = false;
  refreshObjectBar(token);
  assert.equal(token.bars.bar1.visible, false);
});

test("objects cannot receive effects, items, conditions or action ticks", async () => {
  const actor = { type: "object", documentName: "Actor", isOwner: true };
  assert.equal(hooks.get("preCreateActiveEffect")({ parent: actor }), false);
  assert.equal(hooks.get("preCreateItem")({ parent: actor }), false);
  assert.equal(hooks.get("preCreateCombatant")({ actor }), false);
  assert.equal(hooks.get("preCreateActiveEffect")({ parent: { type: "character", documentName: "Actor" } }), undefined);
  await assert.rejects(setConditionField(actor, "schmerz", "level", 1), /keine Zustände/);
  const game = { user: { isGM: true }, combat: { started: true } };
  const canvas = { ready: true, scene: {}, tokens: { controlled: [{ actor }] } };
  assert.match(getSelection(game, canvas).error, /keine Handlungen/);
});
