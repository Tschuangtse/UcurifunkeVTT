import { damageRows, energyRows } from "./energy.js";

export function resourceValue(actor, key) {
  if (actor.type === "bodypart" && key === "LE") return { ...actor.system.health, key };
  return energyRows(actor.system).find(row => row.key === key) ?? null;
}

export function resourceChange(actor, key, amount, source = "Effekt") {
  const current = resourceValue(actor, key);
  if (!current) throw new Error(`${actor.name} verfügt nicht über ${key}.`);
  const value = Math.round(Math.min(current.max, Math.max(actor.type === "bodypart" ? 0 : key === "LE" ? -1000000 : 0, current.value + amount)));
  if (actor.type === "bodypart") return { "system.health.value": value };
  const energies = energyRows(actor.system).map(row => row.key === key ? { ...row, value } : row);
  const changes = { "system.energies": energies };
  if (key === "LE") {
    const damage = damageRows(actor.system);
    const loss = current.value - value;
    if (loss > 0) damage.push({ source, original: loss, remaining: loss, timestamp: new Date().toISOString() });
    else {
      let heal = -loss;
      for (const row of damage) { const used = Math.min(heal, row.remaining); row.remaining -= used; heal -= used; }
    }
    changes["system.damage"] = damage.filter(row => row.remaining > 0);
  }
  return changes;
}
