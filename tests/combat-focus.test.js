import { test } from "node:test";
import assert from "node:assert/strict";
import { combatFocus } from "../src/combat-focus.js";
import { dodgeCheck, evaluateCheck, weaponCheck } from "../src/checks.js";
import { saveTickOverride } from "../src/actions/cost-dialog.js";

test("switching focus replaces the exported modifier rather than adding it again", () => {
  const actor = { system: { impairment: 0, offensiveFocus: 2, defensiveFocus: -2,
    derived: [{ key: "AW", value: 11 }] } };
  const weapon = { name: "Schwert", system: { attack: 14, parry: 10, mobilityTolerance: 0,
    attackBreakdown: [4, 8, 2, 0], parryBreakdown: [4, 8, -2, 0] } };
  assert.equal(combatFocus(actor), 2);
  assert.equal(weaponCheck(actor, weapon, "AT").value, 14);
  actor.system.combatFocus = -2;
  assert.equal(weaponCheck(actor, weapon, "AT").value, 10);
  assert.equal(weaponCheck(actor, weapon, "PA").value, 14);
  assert.equal(dodgeCheck(actor).value, 13);
  actor.system.dodgeOverride = 7;
  assert.equal(dodgeCheck(actor).value, 9);
});

test("tick overrides preserve zero and can be removed to restore the source", async () => {
  const patches = [];
  const actor = { isOwner: true, getFlag: () => ({ melee: { sword: 4 } }), update: async patch => patches.push(patch) };
  await saveTickOverride(actor, "melee", "sword", 0, 8);
  await saveTickOverride(actor, "melee", "sword", 8, 8);
  assert.deepEqual(patches, [
    { "flags.ucurifunke.actionTickOverrides.melee.sword": 0 },
    { "flags.ucurifunke.actionTickOverrides.melee.-=sword": null }
  ]);
});

test("dodge spends the reaction penalties and loses quality ties", () => {
  const actor = { system: { impairment: 2, derived: [{key:"AW",value:16}] } };
  const check = dodgeCheck(actor, { ticks: 12 });
  assert.equal(check.value, 10);
  assert.equal(evaluateCheck({ ...check, opposedQuality: 3 }, [6]).success, true);
  assert.equal(evaluateCheck({ ...check, opposedQuality: 4 }, [6]).success, false);
  assert.equal(evaluateCheck({ ...check, opposedQuality: 4 }, [6]).quality, 4);
  assert.equal(dodgeCheck(actor, {ticks:20,running:true,posture:2,cramped:4}).value,-4);
  actor.system.reaction = 11;
  actor.system.derived.push({ key: "DEF", value: 6 });
  assert.equal(dodgeCheck(actor, { ticks: 12 }).value, 11);
});
