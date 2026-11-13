import { CONDITION_CATALOG } from "./condition-catalog.js";

export const conditionKey = name => name.toLocaleLowerCase("de").replaceAll("ä", "ae")
  .replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss");
const scale = [0, 2, 4, 8];
const small = [0, 1, 2, 4];
export const SUPPRESSIONS = ["Nein", "Ganz", "1 Stufe", "2 Stufen"];
const clamp = (value, max) => Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));

export function conditionRows(data) {
  const catalog = new Map(CONDITION_CATALOG.map(row => [conditionKey(row.Name), row]));
  const saved = new Map((data.conditions ?? []).map(row => [conditionKey(row.name), row]));
  for (const [key, row] of saved) {
    if (!catalog.has(key)) catalog.set(key, { Name: row.name, Type: row.staged ? "Complex" : "Simple", Description: "" });
  }
  return [...catalog].map(([key, definition]) => {
    const name = definition.Name;
    const staged = definition.Type === "Complex";
    const state = saved.get(key) ?? {};
    const automatic = (key === "schmerz" && data.hasIron) || (key === "ueberanstrengung" && data.hasEndurance) ? 1 : 0;
    const max = 3 + automatic;
    const level = staged ? clamp(state.level, max) : 0;
    const suppression = staged ? clamp(state.suppression, 3) : 0;
    const active = !staged && Boolean(state.active);
    const suppressed = !staged && Boolean(state.suppressed);
    const effective = staged ? (suppression === 1 ? 0 : clamp(level - Math.max(automatic, suppression - 1), 3))
      : Number(active && !suppressed);
    return { name, staged, level, suppression, active, suppressed, effective, max, automatic,
      key, description: definition.Description };
  }).sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export function conditionEffects(data) {
  const active = new Map(conditionRows(data).map(row => [row.key, row.effective]));
  const level = key => active.get(key) ?? 0;
  const frenzy = Boolean(level("blutrausch"));
  const pain = frenzy ? 0 : level("schmerz");
  const dazed = level("benommen");
  const paralysis = level("laehmung");
  const anger = level("wut");
  const exhaustion = level("ueberanstrengung");
  const speed = data.derived?.find(row => row.key.toUpperCase() === "GS")?.value;
  let effectiveSpeed = speed == null ? null : speed - small[dazed] - small[pain] - paralysis * 4;
  if (effectiveSpeed > 0 && exhaustion) effectiveSpeed = Math.max(1, effectiveSpeed - scale[exhaustion]);
  if (effectiveSpeed != null) effectiveSpeed = Math.max(0, effectiveSpeed);
  const blocked = paralysis > 0 && effectiveSpeed === 0;
  const modifiers = {};
  const add = (keys, value, name) => {
    if (!value) return;
    for (const key of keys) (modifiers[key] ??= []).push({ name, value });
  };
  if (level("reue")) add(["MU", "CH"], 2, "Reue");
  add(["KL", "CH", "FF", "GE"], small[dazed], "Benommen");
  add(["FF", "GE"], scale[paralysis], "Lähmung");
  add(["KL", "CH"], scale[anger], "Wut");
  add(["RE"], scale[exhaustion], "Überanstrengung");
  return { frenzy, pain, dazed, paralysis, anger, effectiveSpeed, blocked, modifiers,
    reactionPenalty: scale[exhaustion] };
}

export async function setConditionField(actor, key, field, value) {
  if (!actor?.isOwner) return;
  const rows = conditionRows(actor.system);
  const row = rows.find(entry => entry.key === key);
  if (!row) return;
  if (field === "level" && (!Number.isInteger(value) || value < 0 || value > row.max)) {
    throw new Error("Die Stufe muss zwischen 0 und " + row.max + " liegen.");
  }
  row[field] = value;
  await actor.update({ "system.conditions": rows.map(({ name, staged, active, suppressed, level, suppression }) =>
    ({ name, staged, active, suppressed, level, suppression })) });
}

export function conditionSummary(effects) {
  return [
    effects.blocked && "Handlungsunfähig: Lähmung, GS 0.",
    effects.pain === 3 && "Im Kampf handlungsunfähig: Schmerz III.",
    effects.dazed === 3 && "Keine offensiven Kampfhandlungen: Benommen III.",
    effects.frenzy && "Blutrausch: Keine defensiven Proben. Schmerzfolgen werden ignoriert.",
    effects.effectiveSpeed != null && "Geschwindigkeit: " + effects.effectiveSpeed
  ].filter(Boolean);
}

export function situationalConditionOptions(data, check) {
  const levels = new Map(conditionRows(data).map(row => [row.key, row.effective]));
  const fatigue = levels.get("ueberanstrengung") ?? 0;
  return [
    { key: "desire", name: "Begehren", label: check.kind === "combat"
      ? "Der Gegner löst das Begehren aus und die Handlung stillt es nicht" : "Die Handlung dient nicht dazu, das Begehren zu stillen",
      value: levels.get("begehren") ? 4 : 0 },
    { key: "fear", name: "Angst", label: "Die Probe richtet sich gegen den Angstauslöser (keine Flucht oder Ausweichprobe)",
      value: check.title === "Ausweichen" ? 0 : scale[levels.get("angst") ?? 0] },
    { key: "physical", name: "Überanstrengung (körperlich)", label: "Die Probe ist körperlich anstrengend", value: scale[fatigue] },
    { key: "mental", name: "Überanstrengung (geistig)", label: "Die Probe ist geistig fordernd", value: [0, 0, 2, 4][fatigue] }
  ].filter(option => option.value);
}

export function applyConditionEffects(actor, check, situation = {}) {
  const effects = conditionEffects(actor.system);
  const combat = check.kind === "combat";
  if (effects.blocked) throw new Error("Keine Probe möglich: handlungsunfähig durch Lähmung (GS 0).");
  if (combat && effects.pain === 3) throw new Error("Keine Kampfprobe möglich: handlungsunfähig durch Schmerz III.");
  if (combat && check.mode !== "PA" && effects.dazed === 3) throw new Error("Keine offensive Kampfprobe möglich: Benommen III.");
  if (combat && check.mode === "PA" && effects.frenzy) throw new Error("Keine defensive Kampfprobe möglich: Blutrausch.");
  const penalties = [];
  const add = (name, value) => { if (value) penalties.push({ name, value }); };
  const usesMobility = [check, ...(check.attributes ?? [])].some(row => ["FF", "GE"].includes(row.key?.toUpperCase()));
  add("Schmerz", scale[effects.pain]);
  if (combat || usesMobility) add("Lähmung", scale[effects.paralysis]);
  if (combat) {
    add("Benommen", scale[effects.dazed]);
    if (check.mode === "PA") add("Wut", scale[effects.anger]);
  }
  if (Object.values(situation).some(Boolean)) {
    for (const { key, name, value } of situationalConditionOptions(actor.system, check)) {
      if (situation[key] && (key !== "mental" || !situation.physical)) add(name, value);
    }
  }
  const penalty = penalties.reduce((sum, entry) => sum + entry.value, 0);
  const adjust = row => {
    const changes = effects.modifiers[row.key?.toUpperCase()] ?? [];
    for (const { name, value } of changes) add(name + " (" + row.name + ")", value);
    return { ...row, value: row.value - changes.reduce((sum, entry) => sum + entry.value, 0) };
  };
  const adjusted = combat ? check : adjust(check);
  const value = adjusted.value - penalty;
  const attributes = check.attributes?.map(adjust);
  return { ...adjusted, value, ...(attributes ? { attributes } : {}), conditionPenalties: penalties };
}
