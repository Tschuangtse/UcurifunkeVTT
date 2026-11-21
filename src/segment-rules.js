export function segmentPosition(part, from, to) {
  const angle = ((to.rotation ?? 0) - (from.rotation ?? 0)) * Math.PI / 180;
  const pw=part.pixelWidth??0,ph=part.pixelHeight??0;
  const x = part.x + pw/2 - from.x - (from.pixelWidth??0)/2, y = part.y + ph/2 - from.y - (from.pixelHeight??0)/2;
  return { x: to.x + (to.pixelWidth??0)/2 + x * Math.cos(angle) - y * Math.sin(angle) - pw/2,
    y: to.y + (to.pixelHeight??0)/2 + x * Math.sin(angle) + y * Math.cos(angle) - ph/2,
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
