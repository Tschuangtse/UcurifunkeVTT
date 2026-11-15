import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCheck, passesGroupThreshold, registerGroupControls } from "../src/group-checks.js";

test("group checks distinguish the zero threshold and strictly exceed positive thresholds", () => {
  assert.equal(passesGroupThreshold(-1, 0), false);
  assert.equal(passesGroupThreshold(0, 0), true);
  assert.equal(passesGroupThreshold(3, 3), false);
  assert.equal(passesGroupThreshold(4, 3), true);
});

test("only a GM gets the group palette and its three checks", () => {
  const controls = {};
  globalThis.game = { user: { isGM: false } };
  registerGroupControls(controls);
  assert.deepEqual(controls, {});
  game.user.isGM = true;
  registerGroupControls(controls);
  assert.deepEqual(Object.keys(controls.ucurifunkeGroupChecks.tools), ["perception", "kmr", "gmr"]);
  const actor = { system: { attributes: ["GE", "KO", "KK", "kMR"].map(key => ({ key, value: 0 })), derived: [] } };
  assert.equal(groupCheck(actor, "kmr").value, 0);
  assert.equal(groupCheck(actor, "gmr"), null);
});
