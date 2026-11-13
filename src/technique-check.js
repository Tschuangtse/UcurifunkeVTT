import { focusModifier } from "./combat-focus.js";

const MELEE_MODES = ["AT", "PA"];
const BASES = { AT: "OFF", PA: "DEF", FK: "FKB" };
const DEFAULTS = { tolerance: 0, ticks: 0, offensive: 0, defensive: 0 };

export function techniqueFlag(skill) {
  return encodeURIComponent(skill.group + ":" + skill.name).replaceAll(".", "%2E");
}

export function techniqueSettings(actor, skill) {
  return { ...DEFAULTS, ...actor.getFlag("ucurifunke", "techniqueSettings")?.[techniqueFlag(skill)] };
}

export function readTechniqueSettings(fields) {
  const values = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, Number(fields[key])]));
  if (!Object.values(values).every(Number.isSafeInteger) || values.tolerance < 0 || values.ticks < 0 || values.ticks > 32) {
    throw new Error("Bitte Ganzzahlen eingeben. Die Toleranz muss mindestens 0 betragen, die Tickkosten müssen zwischen 0 und 32 liegen.");
  }
  return values;
}

export function techniqueCheck(actor, skill, mode, settings) {
  const modes = skill?.group === "Nahkampf" ? MELEE_MODES : skill?.group === "Fernkampf" ? ["FK"] : [];
  if (!modes.includes(mode) || !Number.isInteger(skill.value)) return null;
  const data = actor.system;
  const base = Math.round(data.derived.find(row => row.key.toUpperCase() === BASES[mode])?.value ?? 0);
  // Earlier imports carried the focus in the weapon breakdown only.
  const importedFocus = mode === "FK" ? 0 : (mode === "PA" ? data.defensiveFocus : data.offensiveFocus)
    ?? actor.items.find(item => item.type === "weapon" && item.system.group !== "Fernkampf" &&
      (mode === "PA" ? item.system.parryBreakdown : item.system.attackBreakdown)?.length === 4)
      ?.system[mode === "PA" ? "parryBreakdown" : "attackBreakdown"][2] ?? 0;
  const breakdown = [skill.value, base, focusModifier(actor, mode, importedFocus), mode === "PA" ? settings.defensive : settings.offensive];
  const impairment = Math.max(0, data.impairment - settings.tolerance);
  const joints = mode === "PA" && data.hasJointPenalty ? 2 : 0;
  return { kind: "combat", name: mode + " · " + skill.name, mode, technique: skill.name,
    breakdown, impairment, joints, ticks: settings.ticks,
    value: breakdown.reduce((sum, entry) => sum + entry, 0) - impairment - joints };
}
