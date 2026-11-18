import assert from "node:assert/strict";
import { test } from "node:test";
import { emitsLight, suspendLightUpdate, restoreLightUpdate } from "../src/token-light-state.js";

function token(light, previous) {
  return { light: { ...light, toObject: () => structuredClone(light) }, getFlag: () => previous };
}

test("switching light off retains exact current settings, including manual dim radius and color intensity", () => {
  const light = { bright: 3.5, dim: 8, color: "#123456", alpha: 0.35, angle: 180,
    animation: { type: "pulse", speed: 4, intensity: 7, reverse: true }, attenuation: 0.8 };
  const update = suspendLightUpdate(token(light));
  assert.deepEqual(update, { "light.bright": 0, "light.dim": 0, "flags.ucurifunke.suspendedTokenLight": light });
  const restored = restoreLightUpdate(token({ ...light, bright: 0, dim: 0 }, update["flags.ucurifunke.suspendedTokenLight"]));
  assert.deepEqual(restored, { light, "flags.ucurifunke.suspendedTokenLight": null });
  assert.notEqual(update["flags.ucurifunke.suspendedTokenLight"], light, "store an independent snapshot");
});

test("dim-only lights also switch off and empty or legacy zero snapshots never trap a token in darkness", () => {
  assert.equal(emitsLight(token({ bright: 0, dim: 5 })), true);
  assert.equal(suspendLightUpdate(token({ bright: 0, dim: 5 }))["light.dim"], 0);
  assert.equal(suspendLightUpdate(token({ bright: 0, dim: 0 })), null);
  for (const previous of [null, {}, { bright: 0, dim: 0 }])
    assert.equal(restoreLightUpdate(token({ bright: 0, dim: 0 }, previous)), null);
});
