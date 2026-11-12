export const COMPLEX_ACTION_INTERVAL = 8;

export function isComplexActionDuration(value) {
  return Number.isSafeInteger(value) && value >= COMPLEX_ACTION_INTERVAL
    && value % COMPLEX_ACTION_INTERVAL === 0;
}

export function normalizeComplexAction(value) {
  if (!value || typeof value !== "object") return null;
  const name = String(value.name ?? "").trim();
  const { duration, spent } = value;
  if (!name || !isComplexActionDuration(duration) || !isComplexActionDuration(spent)
    || spent >= duration) return null;
  return { name, duration, spent };
}
