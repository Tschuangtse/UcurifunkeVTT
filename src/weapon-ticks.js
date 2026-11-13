import { ACTIONS } from "./actions/actions.js";

export function weaponTickFields(item) {
  const { group, speed, reload, parryTicks, preparedCheck, parry } = item.system;
  const ranged = group === "Fernkampf";
  const attack = ranged && !preparedCheck ? ACTIONS.get("ranged").ticks : speed;
  return [
    { action: ranged ? "ranged" : "melee", label: "Angriff", source: attack },
    { action: "parry", label: "Parade", source: !ranged && Number.isInteger(parry) ? parryTicks ?? ACTIONS.get("parry").ticks : null },
    { action: "reload", label: "Laden", source: ranged ? reload : null }
  ].filter(field => Number.isInteger(field.source));
}

export function effectiveTicks(actor, action, weaponId, fallback) {
  return actor?.getFlag?.("ucurifunke", "actionTickOverrides")?.[action]?.[weaponId ?? "manual"] ?? fallback;
}

export function tickOverridePatch(actor, action, weaponId, ticks, source) {
  const key = weaponId ?? "manual";
  const path = "flags.ucurifunke.actionTickOverrides." + action + ".";
  const previous = effectiveTicks(actor, action, weaponId, undefined);
  if (ticks === source) return previous !== undefined ? { [path + "-=" + key]: null } : {};
  return previous !== ticks ? { [path + key]: ticks } : {};
}
