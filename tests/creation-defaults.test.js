import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const hooks = new Map();
globalThis.Hooks = { on: (name, handler) => hooks.set(name, handler) };
globalThis.CONST = {
  TOKEN_DISPLAY_MODES: { HOVER: 30 },
  TOKEN_DISPOSITIONS: { NEUTRAL: 0 }
};
globalThis.foundry = {
  utils: { getProperty: (data, path) => path.split(".").reduce((value, key) => value?.[key], data) }
};
await import("../src/creation-defaults.js");

function creationChanges(name, data) {
  const calls = [];
  hooks.get(name)({ updateSource: changes => calls.push(changes) }, data);
  return calls;
}

test("new actor prototypes and tokens receive the same display, disposition and sight defaults", () => {
  assert.deepEqual(creationChanges("preCreateActor", { prototypeToken: { actorLink: true } }), [{
    "prototypeToken.displayName": 30,
    "prototypeToken.disposition": 0,
    "prototypeToken.sight.enabled": true
  }]);
  assert.deepEqual(creationChanges("preCreateToken", { name: "Test" }), [{
    displayName: 30, disposition: 0, "sight.enabled": true
  }]);
});

test("explicit actor and token settings survive creation, including zero and false", () => {
  assert.deepEqual(creationChanges("preCreateActor", { prototypeToken: { sight: { enabled: false } } }), [{
    "prototypeToken.displayName": 30, "prototypeToken.disposition": 0
  }]);
  assert.deepEqual(creationChanges("preCreateToken", {
    displayName: 0, disposition: -1, "sight.enabled": false
  }), []);
});

test("new scenes default to 1 m, 10% padding and global light, preserving explicit overrides", async () => {
  const manifest = JSON.parse(await readFile(new URL("../system.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.grid, { distance: 1, units: "m" });
  assert.deepEqual(creationChanges("preCreateScene", {}), [{
    padding: 0.1, "environment.globalLight.enabled": true
  }]);
  assert.deepEqual(creationChanges("preCreateScene", {
    grid: { distance: 5, units: "ft" }, padding: 0, environment: { globalLight: { enabled: false } }
  }), []);
  assert.deepEqual([...hooks.keys()], ["preCreateActor", "preCreateToken", "preCreateScene"]);
});
