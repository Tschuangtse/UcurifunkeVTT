const rings = new WeakMap();

export function refreshLightRing(token) {
  if (token.destroyed || token.isPreview) return;
  const source = token.light;
  const radius = source?.data.bright;
  const visible = source?.active && radius > 0 && !token.document.light.negative
    && token.isVisible && token.document.level === canvas.level?.id;
  let ring = rings.get(token);
  if (!visible || !source.shape) {
    if (ring) ring.container.visible = false;
    return;
  }
  if (!ring || ring.container.destroyed || ring.container.parent !== token) {
    const container = token.addChild(new PIXI.Container());
    container.name = "ucurifunke-bright-light-ring";
    container.eventMode = "none";
    const line = container.addChild(new PIXI.Graphics());
    const mask = container.addChild(new PIXI.Graphics());
    line.mask = mask;
    ring = { container, line, mask };
    rings.set(token, ring);
  }
  ring.container.visible = true;
  // Source polygons use scene coordinates; cancel the token's translation.
  ring.container.position.set(-token.x, -token.y);
  const zoom = canvas.stage.scale.x || 1;
  const key = [source.updateId, source.x, source.y, radius, zoom].join("|");
  if (ring.key === key && ring.source === source) return;
  ring.key = key;
  ring.source = source;
  ring.mask.clear().beginFill(0xffffff).drawShape(source.shape).endFill();
  ring.line.clear()
    .lineStyle(3 / zoom, 0x17131b, 0.55).drawCircle(source.x, source.y, radius)
    .lineStyle(1.3 / zoom, 0xfff3d4, 0.85).drawCircle(source.x, source.y, radius);
}

const refreshAll = () => {
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) refreshLightRing(token);
};

Hooks.on("drawToken", refreshLightRing);
Hooks.on("refreshToken", refreshLightRing);
Hooks.on("lightingRefresh", refreshAll);
Hooks.on("canvasPan", refreshAll);
