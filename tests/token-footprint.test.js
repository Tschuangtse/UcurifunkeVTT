import assert from "node:assert/strict";
import { test } from "node:test";
import { FOOTPRINT_DEFAULTS, footprintOptions, portraitPosition, portraitScale } from "../src/token-footprint-data.js";

const hooks = new Map();
globalThis.Hooks = { on: (name, handler) => hooks.set(name, handler), once: (name, handler) => hooks.set(name, handler) };
class Shadow {
  constructor() { this.position = { set: (x, y) => { this.x = x; this.y = y; } }; }
  clear() { return this; }
  beginFill(color) { this.color = color; return this; }
  drawEllipse(...values) { this.ellipse = values; return this; }
  endFill() { return this; }
  destroy() { this.destroyed = true; }
}
globalThis.foundry = { canvas: { primary: { PrimaryGraphics: Shadow } } };
globalThis.CONFIG = { Token: { ring: { isGridFitMode: false } } };
globalThis.canvas = { primary: { addChild(child) { child.parent = this; return child; } } };
const { refreshFootprint } = await import("../src/token-footprint.js");

test("footprint is opt-in and malformed flags cannot introduce invalid color or opacity", () => {
  assert.deepEqual(footprintOptions({ getFlag: () => undefined }), FOOTPRINT_DEFAULTS);
  assert.deepEqual(footprintOptions({ getFlag: () => ({ enabled: true, color: "bad", opacity: -1 }) }),
    { ...FOOTPRINT_DEFAULTS, enabled: true });
  for (const opacity of [0, 0.65, 1]) {
    assert.equal(footprintOptions({ getFlag: () => ({ color: "#ab12CD", opacity }) }).opacity, opacity);
  }
  assert.deepEqual(footprintOptions({ flags: { ucurifunke: { footprint: { enabled: true, color: "#123456", opacity: 0 } } } }),
    { enabled: true, color: "#123456", opacity: 0 });
});

test("the world default is applied only to newly created tokens without an explicit choice", () => {
  let enabled = false;
  const writes = [];
  globalThis.game = { settings: { get: () => enabled, register: (scope, key, data) => {
    assert.equal(scope, "ucurifunke"); assert.equal(key, "footprintDefault");
    assert.equal(data.scope, "world"); assert.equal(data.default, false);
    assert.equal(data.onChange, undefined, "changing the setting never rewrites existing documents");
  } } };
  hooks.get("init")();
  const create = saved => hooks.get("preCreateToken")({ getFlag: () => saved, updateSource: change => writes.push(change) });
  create(undefined);
  assert.equal(writes.length, 0);
  enabled = true;
  create(undefined);
  create({ color: "#123456", opacity: 0.3 });
  assert.deepEqual(writes, [
    { "flags.ucurifunke.footprint.enabled": true }, { "flags.ucurifunke.footprint.enabled": true }
  ]);
  create({ enabled: false });
  create({ enabled: true });
  assert.equal(writes.length, 2, "explicit prototype and token choices are preserved");
  assert.equal(footprintOptions({ flags: {} }).enabled, false, "existing token rendering ignores the world default");
  assert.equal(footprintOptions({ flags: {} }, { defaultEnabled: true }).enabled, true, "prototype UI shows the new-token default");
  assert.equal(footprintOptions({ flags: { ucurifunke: { footprint: { enabled: false } } } }, { defaultEnabled: true }).enabled, false);
  delete globalThis.game;
});

test("portrait remains centered at the bottom for square, tall, wide and large footprints", () => {
  assert.deepEqual(portraitPosition(100, 200, 100, 200, 100), { x: 150, y: 350 });
  assert.deepEqual(portraitPosition(100, 200, 200, 100, 100), { x: 200, y: 250 });
  assert.deepEqual(portraitPosition(100, 200, 200, 200, 200), { x: 200, y: 300 });
  assert.deepEqual(portraitPosition(100, 200, 200, 300, 200), { x: 200, y: 400 });
  assert.deepEqual(portraitScale({ scaleX: -2, scaleY: 1 }), { scaleX: -1, scaleY: 1 });
  assert.deepEqual(portraitScale({ scaleX: 0.5, scaleY: -0.5 }), { scaleX: 0.5, scaleY: -0.5 });
});

test("rendering only changes the portrait mesh and draws a shared footprint behind it", () => {
  let options = { enabled: true, color: "#884422", opacity: 0.6 };
  const resizeCalls = [];
  let shadow;
  const addChild = canvas.primary.addChild;
  canvas.primary.addChild = function(child) { shadow = addChild.call(this, child); return shadow; };
  const mesh = { visible: true, renderable: true, alpha: 0.5, elevation: 3, sortLayer: 800, sort: 2, zIndex: 1, height: 100,
    resize: (...args) => resizeCalls.push(args), anchor: { set() {} }, position: { set: (x, y) => { mesh.x = x; mesh.y = y; } } };
  const token = { x: 100, y: 200, objectId: "Token.test", mesh,
    document: { texture: { scaleX: 1, scaleY: 1 }, getSize: () => ({ width: 100, height: 200 }), getFlag: () => options },
    _refreshMesh() { mesh.restored = true; }, _refreshPosition() { mesh.x = 150; mesh.y = 300; } };
  refreshFootprint(token);
  assert.deepEqual(resizeCalls[0], [100, 100, { fit: "contain", scaleX: 1, scaleY: 1 }]);
  assert.deepEqual([mesh.x, mesh.y], [150, 350]);
  assert.deepEqual(shadow.ellipse, [50, 100, 50, 100]);
  assert.equal(shadow.color, 0x884422);
  assert.equal(shadow.alpha, 0.3);
  assert.ok(shadow.sortLayer < mesh.sortLayer);
  assert.deepEqual(token.document.getSize(), { width: 100, height: 200 });
  mesh.visible = false;
  refreshFootprint(token);
  assert.equal(shadow.visible, false, "hidden tokens cannot reveal their footprint");
  options = { enabled: false };
  refreshFootprint(token);
  assert.equal(shadow.destroyed, true);
  assert.equal(mesh.restored, true);
  assert.deepEqual([mesh.x, mesh.y], [150, 300]);
  canvas.primary.addChild = addChild;
});
