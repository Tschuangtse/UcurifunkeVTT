import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCheck, passesGroupThreshold, registerGroupControls, sharedGroupSkills } from "../src/group-checks.js";

test("group checks distinguish the zero threshold and strictly exceed positive thresholds", () => {
  assert.equal(passesGroupThreshold(-1, 0), false);
  assert.equal(passesGroupThreshold(0, 0), true);
  assert.equal(passesGroupThreshold(3, 3), false);
  assert.equal(passesGroupThreshold(4, 3), true);
});

test("only a GM gets the group palette and its four controls", () => {
  const controls = {};
  globalThis.game = { user: { isGM: false } };
  registerGroupControls(controls);
  assert.deepEqual(controls, {});
  game.user.isGM = true;
  registerGroupControls(controls);
  assert.deepEqual(Object.keys(controls.ucurifunkeGroupChecks.tools), ["perception", "kmr", "gmr", "shared"]);
  const actor = { system: { attributes: ["GE", "KO", "KK", "kMR"].map(key => ({ key, value: 0 })), derived: [] } };
  assert.equal(groupCheck(actor, "kmr").value, 0);
  assert.equal(groupCheck(actor, "gmr"), null);
});

test("shared skills require the exact rollable specialization and retain each actor's value", () => {
  const parent = { name: "Athletik", group: "Körper", rollable: false, attributes: [] };
  const makeActor = (name, value, group = "Körper") => ({ type: "character", system: { skills: [
    parent, { name: "Athletik – " + name, group, rollable: true, value, attributes: ["GE", "KO", "KK"].map(key => ({ key, value })) }
  ] } });
  const first = makeActor("Kraftakt", 4), second = makeActor("Kraftakt", 12);
  assert.deepEqual(sharedGroupSkills([first, second]).map(skill => [skill.label, skill.checks.map(check => check.value)]),
    [["Athletik – Kraftakt", [4, 12]]]);
  assert.deepEqual(sharedGroupSkills([first, makeActor("Reflexe", 12)]), []);
  assert.deepEqual(sharedGroupSkills([first, { system: { skills: [parent] } }]), []);
});
