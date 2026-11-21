import { validateFilter } from "./effect-filters.js";
export const PRIMARY_KEYS = ["MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"];
export const DERIVED_KEYS = ["OFF", "DEF", "FKB", "AW", "WS", "TK", "GS", "BL", "WA"];
export const EFFECT_TARGETS = [
  ...["LE", "AE", "KE"].map(key => ({ key, label: key + " aktuell", periodic: true })),
  ...["LE", "AE", "KE"].map(key => ({ key: "max." + key, label: key + " Maximum", periodic: true })),
  ...[...PRIMARY_KEYS, "gMR", "kMR", "RE"].map(key => ({ key: "attribute." + key, label: "Attribut " + key })),
  ...DERIVED_KEYS.map(key => ({ key: "derived." + key, label: "Abgeleiteter Wert " + key })),
  { key: "impairment", label: "Beeinträchtigung" }, { key: "actionTicks", label: "Tickkosten", continuous: true },
  {key:"checkPenalty",label:"Proben erschweren",continuous:true}, {key:"checkBonus",label:"Proben erleichtern",continuous:true}
];

export function validateEffect(source) {
  const kind = source.kind;
  if (!["periodic", "continuous"].includes(kind)) throw new Error("Bitte die Wirkungsart wählen.");
  const interval = Number(source.interval), duration = Number(source.duration);
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 1000000) throw new Error("Das Intervall muss zwischen 1 und 1.000.000 Ticks liegen.");
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 1000000) throw new Error("Die Dauer muss zwischen 1 und 1.000.000 Ticks liegen.");
  if (kind === "periodic" && !source.permanent && duration < interval) throw new Error("Die Dauer muss mindestens ein Intervall umfassen.");
  if (!source.changes?.length || source.changes.length > 30) throw new Error("Bitte zwischen einer und 30 Wirkungen anlegen.");
  const changes = source.changes.map(change => {
    const target = EFFECT_TARGETS.find(row => row.key === change.target);
    if (!target || kind === "continuous" && target.periodic || kind === "periodic" && target.continuous) throw new Error("Dieser Zielwert passt nicht zur Wirkungsart.");
    const value = Number(change.value);
    if (!["add", "percent"].includes(change.mode) || !Number.isFinite(value) || Math.abs(value) > 100000) throw new Error("Bitte eine gültige Wirkung angeben.");
    if (["checkPenalty","checkBonus"].includes(target.key) && value < 0) throw new Error("Erschwernis und Erleichterung bitte als positiven Betrag angeben.");
    return { target: target.key, mode: change.mode, value, ...validateFilter(change) };
  });
  return { kind, interval, duration, changes, recurring: Boolean(source.recurring), permanent: Boolean(source.permanent), stackable: Boolean(source.stackable), description: String(source.description ?? "") };
}

export function modifiedValue(base, changes, { ticks = false } = {}) {
  const flat = changes.filter(row => row.mode === "add").reduce((sum, row) => sum + row.value, 0);
  const percent = changes.filter(row => row.mode === "percent").reduce((sum, row) => sum + row.value, 0);
  const result = (base + flat) * (1 + percent / 100);
  return ticks ? Math.max(0, Math.ceil(result - 1e-9)) : Math.round(result);
}

export function effectClock(combat) { return Number(combat?.getFlag("ucurifunke", "totalTicks") ?? 0); }
export function remainingDuration(effect, now) { return effect.permanent ? null : Math.max(0, effect.expiresAt - now); }
export function expiredEffect(effect, now) {
  if (effect.permanent || effect.expiresAt == null || !effect.combatId) return false;
  if (effect.kind === "periodic" && effect.nextAt <= effect.expiresAt) return false;
  return now >= effect.expiresAt;
}

export function tokenEffects(token) { return token?.getFlag?.("ucurifunke", "effects") ?? []; }
export function activeTokenEffects(token, combat) {
  return tokenEffects(token).filter(effect => !effect.combatId || effect.combatId === combat?.id)
    .filter(effect => !expiredEffect(effect, effectClock(combat)));
}
