export const FOOTPRINT_DEFAULTS = { enabled: false, color: "#211c16", opacity: 0.65 };

export function footprintOptions(document) {
  const saved = document.getFlag?.("ucurifunke", "footprint") ?? document.flags?.ucurifunke?.footprint ?? {};
  const opacity = saved.opacity === "" || saved.opacity == null ? NaN : Number(saved.opacity);
  return {
    enabled: saved.enabled === true,
    color: typeof saved.color === "string" && /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : FOOTPRINT_DEFAULTS.color,
    opacity: Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : FOOTPRINT_DEFAULTS.opacity
  };
}

export function portraitScale(texture = {}) {
  const valid = value => Number.isFinite(value) ? value : 1;
  const x = valid(texture.scaleX), y = valid(texture.scaleY);
  const scale = Math.min(Math.abs(x), Math.abs(y));
  return { scaleX: Math.sign(x) * scale, scaleY: Math.sign(y) * scale };
}

export function portraitPosition(x, y, width, height, portraitHeight) {
  return { x: x + width / 2, y: y + height - portraitHeight / 2 };
}
