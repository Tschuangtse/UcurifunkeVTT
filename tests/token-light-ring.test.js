import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.Hooks = { on() {} };
globalThis.canvas = { level: { id: "level" }, stage: { scale: { x: 0.5 } } };
class Container {
  constructor() { this.children = []; this.position = { set: (...values) => { this.position.values = values; } }; }
  addChild(child) { child.parent = this; this.children.push(child); return child; }
}
class Graphics extends Container {
  constructor() { super(); this.circles = []; }
  clear() { this.circles = []; return this; }
  beginFill() { return this; }
  endFill() { return this; }
  drawShape(shape) { this.shape = shape; return this; }
  lineStyle(width) { this.width = width; return this; }
  drawCircle(...circle) { this.circles.push(circle); return this; }
}
globalThis.PIXI = { Container, Graphics };
const { refreshLightRing } = await import("../src/token-light-ring.js");

test("bright border uses the actual source radius including the token edge and clips to the wall-limited light polygon", () => {
  const token = Object.assign(new Container(), { x: 200, y: 300, isVisible: true,
    document: { level: "level", light: { negative: false } },
    light: { active: true, x: 250, y: 350, data: { bright: 450, dim: 650 }, shape: { points: [0, 0, 100, 0, 100, 100] }, updateId: 1 }
  });
  refreshLightRing(token);
  const ring = token.children[0];
  assert.equal(ring.visible, true);
  assert.equal(ring.eventMode, "none");
  assert.deepEqual(ring.position.values, [-200, -300]);
  assert.deepEqual(ring.children[0].circles, [[250, 350, 450], [250, 350, 450], [250, 350, 647], [250, 350, 647]]);
  assert.equal(ring.children[0].mask.shape, token.light.shape);
  assert.equal(ring.children[0].width, 2.6, "border remains legible at half zoom");
  token.light.shape = { points: [10, 10, 80, 10, 80, 80] };
  token.light.updateId++;
  refreshLightRing(token);
  assert.equal(ring.children[0].mask.shape, token.light.shape, "wall changes update the clipping mask");
  for (const change of [() => { token.light.active = false; }, () => { token.light.data.bright = token.light.data.dim = 0; },
    () => { token.isVisible = false; }, () => { token.document.level = "other"; },
    () => { token.document.light.negative = true; }]) {
    change(); refreshLightRing(token); assert.equal(ring.visible, false);
    token.light.active = true; token.light.data.bright = 450; token.light.data.dim = 650; token.isVisible = true;
    token.document.level = "level"; token.document.light.negative = false;
  }
});

test("dim-only light has a border and equal bright and dim radii do not draw duplicate rings", () => {
  const token = Object.assign(new Container(), { x: 0, y: 0, isVisible: true,
    document: { level: "level", light: { negative: false } },
    light: { active: true, x: 50, y: 50, data: { bright: 0, dim: 650 }, shape: { points: [0, 0, 100, 0, 100, 100] }, updateId: 1 }
  });
  refreshLightRing(token);
  const ring = token.children[0];
  assert.equal(ring.visible, true);
  assert.deepEqual(ring.children[0].circles, [[50, 50, 647], [50, 50, 647]]);
  token.light.data.dim = 450;
  token.light.data.bright = 450;
  refreshLightRing(token);
  assert.deepEqual(ring.children[0].circles, [[50, 50, 447], [50, 50, 447]]);
});
