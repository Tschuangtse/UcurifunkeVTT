import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LIGHT_PRESETS, campaignLightPresets, lightUpdate, validateLight, validatePresetName } from "../src/light-presets.js";

const types = ["flame", "torch", "pulse"];
const torch = DEFAULT_LIGHT_PRESETS[0];
const user = (id, records) => ({ id, getFlag: () => records });

test("light defaults use Foundry V14 animation identifiers and always derive dim from bright", () => {
  assert.deepEqual(DEFAULT_LIGHT_PRESETS.map(({ bright, type, speed, intensity }) => [bright, type, speed, intensity]),
    [[4, "flame", 2, 5], [6, "torch", 2, 5], [4, "pulse", 2, 1]]);
  assert.deepEqual(DEFAULT_LIGHT_PRESETS.map(preset => preset.alpha), [0.3, 0.3, 0.5]);
  for (let bright = 0; bright <= 16; bright++) {
    const light = validateLight({ ...torch, bright: String(bright) }, types);
    const update = lightUpdate(light);
    assert.equal(update["light.bright"], bright);
    assert.equal(update["light.dim"], 1.5 * bright);
    assert.equal(update["light.animation.type"], "flame");
    assert.equal(update["light.alpha"], 0.3);
    assert.equal(Object.keys(update).length, 7, "unrelated token light settings are preserved");
  }
  assert.equal(lightUpdate(validateLight({ ...torch, type: "" }, types))["light.animation.type"], null);
});

test("invalid light values are rejected before writing token or preset data", () => {
  for (const bright of ["", null, undefined, true, NaN, Infinity, -1, 17, 1.5, "four"])
    assert.throws(() => validateLight({ ...torch, bright }, types), /Lichtstufe/);
  for (const [field, invalid] of [["speed", -1], ["speed", 11], ["intensity", 0], ["intensity", 11],
    ["type", "missing"], ["color", "red"], ["color", "#ff0000;background:url(x)"]])
    assert.throws(() => validateLight({ ...torch, [field]: invalid }, types));
});

test("color intensity validates zero through one and upgrades old saved presets without discarding them", () => {
  for (const alpha of [0, 0.3, "0.5", 1]) {
    assert.equal(validateLight({ ...torch, alpha }, types).alpha, Number(alpha));
  }
  for (const alpha of ["", null, true, NaN, Infinity, -0.1, 1.1])
    assert.throws(() => validateLight({ ...torch, alpha }, types), /Farbintensität/);
  const { alpha, ...legacy } = torch;
  const merged = campaignLightPresets([user("player", {
    fackel: { ...legacy, revision: 1 }, custom: { ...legacy, name: "Altes Licht", revision: 2 }
  })], types);
  assert.equal(merged.find(preset => preset.id === "fackel").alpha, 0.3);
  assert.equal(merged.find(preset => preset.id === "custom").alpha, 0.5);
  assert.equal(validateLight(legacy, types).alpha, 0.5);
});

test("new names require four letters and reject existing names regardless of case or surrounding whitespace", () => {
  for (const name of ["", "Abc", "A12345", "12-!?", "a".repeat(81)])
    assert.throws(() => validatePresetName(name, DEFAULT_LIGHT_PRESETS), /vier Buchstaben/);
  for (const name of ["Fackel", "  fAcKeL ", "Ｆａｃｋｅｌ", "Laterne", "Flim Flam"])
    assert.throws(() => validatePresetName(name, DEFAULT_LIGHT_PRESETS), /existiert bereits/);
  assert.equal(validatePresetName(" Eislicht ", DEFAULT_LIGHT_PRESETS), "Eislicht");
  assert.equal(validatePresetName("Fackel", DEFAULT_LIGHT_PRESETS, "fackel"), "Fackel");
});

test("campaign presets merge player and GM revisions, including edits by another user and built-in overrides", () => {
  const custom = { ...torch, name: "Eislicht", revision: 100 };
  const users = [user("gm", { ice: custom, fackel: { ...torch, bright: 5, revision: 110 } }),
    user("player", { ice: { ...custom, bright: 8, revision: 101 } })];
  const merged = campaignLightPresets(users, types);
  assert.equal(merged.length, 4);
  assert.equal(merged.find(p => p.id === "ice").bright, 8);
  assert.equal(merged.find(p => p.id === "fackel").bright, 5);
  assert.deepEqual(campaignLightPresets([...users].reverse(), types), merged);
  const tie = [user("a", { ice: custom }), user("z", { ice: { ...custom, bright: 9 } })];
  assert.equal(campaignLightPresets(tie, types).find(p => p.id === "ice").bright, 9);
  assert.deepEqual(campaignLightPresets(tie, types), campaignLightPresets([...tie].reverse(), types));
});

test("malformed shared presets do not break the HUD or overwrite valid defaults", () => {
  const bad = user("player", { bad: { ...torch, bright: 90, revision: 1 },
    fackel: { ...torch, type: "missing", revision: 2 },
    "bad.path": { ...torch, revision: 1 }, unnamed: { ...torch, name: null, revision: 1 } });
  assert.equal(campaignLightPresets([bad], types).length, 3);
  assert.equal(campaignLightPresets([bad], types)[0].bright, 4);
});
