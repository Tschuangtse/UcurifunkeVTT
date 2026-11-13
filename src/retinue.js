import { assignedRetinueEquipment } from "./import-data.js";

const GROUPS = { Animals: "Tier", Persons: "Person", Demons: "Dämon", Undead: "Untoter", Chimeras: "Chimäre",
  Elementals: "Elementar", Golems: "Golem" };
const ATTRIBUTES = {
  MU: "Mut", KL: "Klugheit", IN: "Intuition", CH: "Charisma", FF: "Fingerfertigkeit",
  GE: "Gewandtheit", KO: "Konstitution", KK: "Körperkraft"
};
const ABILITIES = { MundaneAbilities: "Mundan", MagicalAbilities: "Magisch", DivineAbilities: "Klerikal" };
const list = rows => Array.isArray(rows) ? rows.filter(row => row && typeof row === "object") : [];
const text = value => typeof value === "string" ? value.trim() : "";
const number = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const integer = value => Math.trunc(number(value));
const positive = value => Math.max(0, integer(value));
const rounded = value => Math.sign(value) * Math.round(Math.abs(value));

function detail(name, value) {
  return { name, value: typeof value === "number" ? String(value) : text(value) };
}

function attackItem(attack, index) {
  const name = text(attack.Name);
  const count = positive(attack.DamageDiceCount);
  const faces = positive(attack.DamageDiceSides) || 6;
  const bonus = integer(attack.DamageBonus);
  const damage = text(attack.DamageExpression) || (count ? count + "W" + faces + (bonus > 0 ? "+" + bonus : bonus || "") : String(bonus));
  const reach = text(attack.Ranges) || text(attack.DistanceExpression) ||
    [attack.IsShort && "Kurz", attack.IsMedium && "Mittel", attack.IsLong && "Lang"].filter(Boolean).join(" / ");
  return { type: "weapon", name: name || "Angriff", system: {
    sourceId: "attack:" + name + ":" + index, group: attack.IsRanged ? "Fernkampf" : "Nahkampf", quantity: 1,
    attack: typeof attack.AttackValue === "number" ? integer(attack.AttackValue) : null,
    parry: attack.IsRanged || typeof attack.ParryValue !== "number" ? null : integer(attack.ParryValue),
    damage, reach, speed: positive(attack.AttackTicks), reload: attack.IsRanged ? positive(attack.ReloadTicks) : null,
    preparedCheck: true, parryTicks: positive(attack.ParryTicks ?? 4), carried: true,
    description: [text(attack.Notes), text(attack.SpecialEffects)].filter(Boolean).join("\n"),
    properties: text(attack.WeaponDamageType)
  } };
}

function personTotal(row) {
  const basis = number(row.BaseValue);
  const modifiers = number(row.RuleModifier) + number(row.Modifier);
  return rounded(number(row.Constant) + (row.IsMultiplier ? basis * modifiers : basis + modifiers));
}

export function convertRetinue(source) {
  const seen = new Map();
  return Object.entries(GROUPS).flatMap(([field, category]) => list(source[field]).map(member => {
    const name = text(member.Name) || category;
    const id = text(member.InventoryId);
    const baseKey = field + ":" + (id || name);
    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);
    const sourceKey = occurrence ? baseKey + ":" + occurrence : baseKey;
    const components = list(member.Components);
    const plantOnly = field === "Chimeras" && components.length > 0 && components.every(row => row.Kind === 1 || row.Kind === "Plant");
    const categoryName = plantOnly ? "Pflanzenchimäre" : field === "Chimeras" && components.some(row => row.Kind === 2 || row.Kind === "Demon")
      ? "Daimonid" : category;
    const primary = plantOnly ? [] : Object.entries(ATTRIBUTES).map(([key, name]) => ({
      name, key, value: integer(member[key]), kind: "primary"
    }));
    const attributes = plantOnly ? [] : [...primary,
      { key: "gMR", name: "Geistige Magieresistenz", value: integer(member.MentalMagicResistance), kind: "secondary" },
      { key: "kMR", name: "Körperliche Magieresistenz", value: integer(member.PhysicalMagicResistance), kind: "secondary" },
      { key: "RE", name: "Reaktionsvermögen", value: integer(member.Reaction), kind: "secondary" }];
    const skills = plantOnly ? [] : Object.entries(ABILITIES).flatMap(([key, group]) => list(member[key]).filter(row => text(row.Name))
      .map(row => ({ name: text(row.Name), group, value: integer(row.Value), rollable: true, rollName: text(row.Name),
        attributes: [row.FirstAttribute, row.SecondAttribute, row.ThirdAttribute].map(key => primary.find(a => a.key === key)
          ?? { name: "", key: "", value: 0 }) })));
    const derived = plantOnly ? [] : list(member.DerivedValues).filter(row => text(row.Key) && text(row.Name))
      .map(row => ({ key: text(row.Key), name: text(row.Name), value: personTotal(row) }));
    const baseValues = [
      ["GS", "Geschwindigkeit", member.Speed], ["TK", "Tragkraft", member.CarryCapacity],
      ["ZK", "Zugkraft", member.PullCapacity], ["BL", "Bindungslast", member.BindingLoad],
      ["nRS", "Natürlicher Rüstungsschutz", member.NaturalArmor],
      ["pRS", "Rüstungsschutz", member.ArmorProtection], ["GW", "Gefahrenwert", member.DangerValue],
      ["AS", "Astralsinn", member.AstralSense], ["BS", "Beschwörungsschwierigkeit", member.SummoningDifficulty]
    ];
    if (!plantOnly) for (const [key, name, value] of baseValues) {
      if (typeof value === "number" && !derived.some(row => row.key === key)) derived.push({ key, name, value });
    }
    const attacks = plantOnly ? [] : list(member.Attacks).map(attackItem);
    const equipment = assignedRetinueEquipment(source, id);
    const details = [
      detail("Größenklasse", member.SizeClass), detail("Gewicht", member.Weight),
      detail("Beschreibung", member.Description), detail("Besondere Eigenschaften", member.SpecialProperties),
      detail("Schwächen", member.Weaknesses), detail("Notizen", member.Notes),
      detail("Domäne", member.Domain), detail("Material", member.MaterialAndRaising),
      detail("Bestandteile", components.map(row => (row.Quantity ?? 1) + " × " + text(row.Name)).join(", ")),
      ...list(member.Properties).map(row => detail(text(row.Name), row.Description))
    ].filter(row => row.name && row.value);
    const resources = plantOnly ? [] : [
      ["LE", member.CurrentLe, member.MaxLe], ["AE", member.CurrentAstralEnergy, member.AstralEnergy],
      ["KE", member.CurrentKarmaEnergy, member.KarmaEnergy]
    ].filter(([, current, max]) => typeof current === "number" && typeof max === "number" && max > 0)
      .map(([name, current, max]) => detail(name, current + " / " + max));
    return { sourceKey, data: { name, type: "retinue", prototypeToken: { name, actorLink: true },
      system: { sourceName: name, race: text(member.Species) || text(member.Race?.Name),
        companionKind: categoryName, companionDetails: [...resources, ...details],
        attributes, skills, derived, reaction: positive(member.Reaction), impairment: positive(member.Impairment),
        naturalArmor: positive(member.NaturalArmor),
        offensiveFocus: integer(member.Focus), defensiveFocus: -integer(member.Focus),
        companionArmor: typeof member.ArmorProtection === "number" ? positive(member.ArmorProtection) : null
      }, items: [...attacks, ...equipment] } };
  }));
}

export function retinueSource(source) {
  const data = Object.fromEntries(Object.keys(GROUPS).map(key => [key, list(source[key])]));
  const ids = new Set(Object.values(data).flat().map(member => text(member.InventoryId)).filter(Boolean));
  for (const key of ["GeneralItems", "InventoryContainers", "Armors", "Ammunitions"]) {
    data[key] = list(source[key]).filter(row => ids.has(text(row.CarrierAnimalId)));
  }
  data.authoritative = Array.isArray(source.authoritative) ? source.authoritative
    : Object.keys(GROUPS).filter(key => Array.isArray(source[key]));
  return data;
}

export function planRetinue(owner, source, actors = game.actors) {
  const entries = convertRetinue(source);
  const existing = actors.filter(actor => actor.type === "retinue"
    && actor.getFlag("ucurifunke", "retinueOwner") === owner.id);
  const incoming = new Set(entries.map(entry => entry.sourceKey));
  const removed = existing.filter(actor => {
    const key = actor.getFlag("ucurifunke", "retinueSource");
    return key && source.authoritative?.includes(key.split(":")[0]) && !incoming.has(key);
  });
  return { entries, existing, removed };
}

export async function syncRetinue(owner, source, { folder } = {}) {
  const { entries, existing, removed } = planRetinue(owner, source);
  const bySource = new Map(existing.map(actor => [actor.getFlag("ucurifunke", "retinueSource"), actor]));
  const pending = [];
  for (const { sourceKey, data } of entries) {
    const actor = bySource.get(sourceKey);
    try {
      if (actor?.isOwner) await actor.importPedipalpusData(data);
      else if (actor || !game.user.can("ACTOR_CREATE")) pending.push(data.name);
      else await foundry.documents.Actor.implementation.create({ ...data, ...(folder ? { folder } : {}),
        ownership: owner.toObject().ownership, flags: { ucurifunke: { retinueOwner: owner.id, retinueSource: sourceKey } } });
    } catch (error) {
      pending.push(data.name);
      console.warn("Ucurifunke | Gefolge konnte nicht übernommen werden", error);
    }
  }
  for (const actor of removed) {
    try {
      if (!game.user.isGM) {
        pending.push(actor.name + " (entfernen)");
        continue;
      }
      for (const scene of game.scenes ?? []) {
        const tokens = scene.tokens.filter(token => token.actorId === actor.id).map(token => token.id);
        if (tokens.length) await scene.deleteEmbeddedDocuments("Token", tokens);
      }
      await actor.delete();
    } catch (error) {
      pending.push(actor.name + " (entfernen)");
      console.warn("Ucurifunke | Gefolge konnte nicht entfernt werden", error);
    }
  }
  if (pending.length) await owner.setFlag("ucurifunke", "retinuePending", source);
  else if (owner.getFlag("ucurifunke", "retinuePending")) await owner.unsetFlag("ucurifunke", "retinuePending");
  return pending;
}
