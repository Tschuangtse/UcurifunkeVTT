export function segmentPosition(part, from, to) {
  const angle = ((to.rotation ?? 0) - (from.rotation ?? 0)) * Math.PI / 180;
  const x = part.x - from.x, y = part.y - from.y;
  return { x: to.x + x * Math.cos(angle) - y * Math.sin(angle), y: to.y + x * Math.sin(angle) + y * Math.cos(angle),
    rotation: ((part.rotation ?? 0) + angle * 180 / Math.PI + 360) % 360,
    elevation: (part.elevation ?? 0) + (to.elevation ?? 0) - (from.elevation ?? 0) };
}

export function partHealthPlan(health, payload) {
  const max = payload.max === undefined ? health.max : Number(payload.max);
  const requested = payload.delta === undefined ? payload.value === undefined ? health.value : Number(payload.value) : health.value + Number(payload.delta);
  if (!Number.isSafeInteger(max) || max < 1 || max > 1000000 || !Number.isSafeInteger(requested)) throw new Error("LE müssen ganze Zahlen sein; das Maximum muss zwischen 1 und 1.000.000 liegen.");
  const value = Math.max(0, Math.min(max, requested));
  return { value, max, loss: Math.max(0, health.value - value) };
}
