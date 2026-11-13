export function equipmentImpairment(actor) {
  const rawArmor = actor.items.filter(item => item.system.group === "Rüstung" && item.system.carried && item.system.equipped)
    .reduce((total, item) => total + (item.system.mobilityPenalty ?? 0), 0);
  const armor = Math.max(0, rawArmor - Number(Boolean(actor.system.armorTraining)));
  if (actor.system.npcGenerator) return armor;
  const capacity = actor.system.derived.find(row => row.key.toUpperCase() === "TK")?.value;
  if (!(capacity > 0)) return armor;
  const weight = actor.items.filter(item => item.system.carried)
    .reduce((total, item) => total + (item.system.weight ?? 0) * (item.system.quantity ?? 1), 0);
  return armor + (weight > capacity * 2 ? 3 : weight > capacity * 1.5 ? 2 : weight > capacity ? 1 : 0);
}
