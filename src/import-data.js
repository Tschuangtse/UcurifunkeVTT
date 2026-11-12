const SKILLS = {
  BodySkills: "Körper", SocialSkills: "Gesellschaft", NatureSkills: "Natur",
  AcademicSkills: "Wissen", CraftingSkills: "Handwerk", HobbySkills: "Hobby",
  MeleeSkills: "Nahkampf", RangedSkills: "Fernkampf", MagicSchools: "Magieschulen",
  Spells: "Zauber", Rites: "Riten", Rituals: "Rituale", Miracles: "Wunder"
};

const MUNDANE_SPECIALIZATIONS = new Set(["BodySkills", "SocialSkills", "NatureSkills", "AcademicSkills", "CraftingSkills"]);
const SINGLE_CHECKS = new Set(["HobbySkills", "Spells", "Rituals", "Miracles"]);
const EQUIPMENT = {
  GeneralItems: "Gegenstand", InventoryContainers: "Behälter", Armors: "Rüstung",
  Ammunitions: "Munition", MeleeWeapons: "Nahkampf", ParryWeapons: "Nebenhand", RangedWeapons: "Fernkampf"
};

const list = value => Array.isArray(value) ? value.filter(row => row && typeof row === "object") : [];
const string = value => typeof value === "string" ? value.trim() : "";
const number = (value, fallback = 0) => {
  if (typeof value === "string" && /^-?\d+(?:[.,]\d+)?$/.test(value.trim())) value = Number(value.replace(",", "."));
  return Number.isFinite(value) ? value : fallback;
};
const integer = value => Math.trunc(number(value));
const positive = value => Math.max(0, integer(value));
const ticks = value => value == null ? null : positive(value);
const germanKey = value => string(value).toLowerCase().replaceAll("ä", "ae").replaceAll("ö", "oe")
  .replaceAll("ü", "ue").replaceAll("ß", "ss");
const attributeValue = row => integer(row.BaseValue) + integer(row.ModValue);

function bestTechnique(character, weapon, ranged) {
  const skills = list(character[ranged ? "RangedSkills" : "MeleeSkills"]);
  const allowed = (Array.isArray(weapon.UsedSkills) ? weapon.UsedSkills : []).map(germanKey).filter(Boolean);
  if (!allowed.length) allowed.push(germanKey(weapon.UsedSkill));
  return allowed.map(name => skills.find(skill => name && germanKey(skill.Name) === name))
    .filter(Boolean).sort((left, right) => integer(right.Value) - integer(left.Value))[0];
}

function reloadTicks(weapon, skill) {
  const loading = ticks(weapon.LoadingSpeed);
  if (loading == null) return null;
  const properties = string(weapon.SpecialProperties);
  if (!/\bMunitionswaffe\b/i.test(properties)) return loading;
  if (/\bRepetier(?:waffe|mechanismus)?\b/i.test(properties)) return Math.max(8, loading);
  const standard = ticks(weapon.StandardLoadingSpeed) ?? loading;
  return Math.max(8, Math.ceil(loading - standard * Math.floor(positive(skill) / 5) / 8));
}

function carriedByCharacter(weapon) {
  return weapon.OnPerson === true && !string(weapon.CarrierAnimalId) && positive(weapon.Quantity ?? 1) > 0;
}

function offHandBonus(character, weapon) {
  const oneHanded = item => germanKey(item.Handedness) === "einhaendig";
  if (!carriedByCharacter(weapon) || !oneHanded(weapon) ||
      ["unbewaffnet", "waffenlos"].includes(germanKey(weapon.Name))) return 0;
  const offHand = list(character.ParryWeapons).find(item => item.InventoryItemId &&
    item.InventoryItemId === character.ActiveOffHandWeaponId && carriedByCharacter(item) && oneHanded(item));
  return integer(offHand?.DefenseBonus);
}

function equipment(character, row, group, container = "") {
  const name = string(row.Name);
  if (!name) return [];
  const ranged = group === "Fernkampf";
  const weapon = ranged || ["Nahkampf", "Nebenhand"].includes(group);
  const technique = weapon ? bestTechnique(character, row, ranged) : null;
  const skill = integer(technique?.Value);
  const attackBreakdown = technique ? [skill, integer(ranged ? character.Fk : character.Off),
    ranged ? 0 : integer(character.OffOffset), integer(row.AttackBonus)] : [];
  const parryBreakdown = !ranged && technique ? [skill, integer(character.Def), integer(character.DefOffset),
    group === "Nebenhand" ? integer(row.DefenseBonus) : integer(row.ParryBonus) + offHandBonus(character, row)] : [];
  const system = {
    sourceId: string(row.InventoryItemId ?? row.InventoryId), group, container,
    quantity: positive(row.Quantity ?? 1), weight: Math.max(0, number(row.Weight)),
    description: string(row.Description), properties: string(row.SpecialProperties),
    carried: carriedByCharacter(row), equipped: Boolean(row.IsEquiped), protection: positive(row.Protection)
  };
  if (weapon) Object.assign(system, {
    speed: ticks(row.WeaponSpeed), reload: ranged ? reloadTicks(row, skill) : null,
    damage: string(row.Damage), reach: string(row.Reach), technique: string(technique?.Name),
    mobilityTolerance: ranged ? 2 : positive(row.MobilityTolerance),
    attackBreakdown, parryBreakdown,
    attack: attackBreakdown.length ? attackBreakdown.reduce((sum, value) => sum + value, 0) : null,
    parry: parryBreakdown.length ? parryBreakdown.reduce((sum, value) => sum + value, 0) : null
  });
  return [{ name, type: weapon ? "weapon" : "equipment", system },
    ...list(row.Items).flatMap(item => equipment(character, item, "Gegenstand", name))];
}

export function isPedipalpusCharacter(source) {
  return Array.isArray(source?.PrimaryAttributes) && Object.hasOwn(source, "Version");
}

export function parseCharacter(text) {
  return convertCharacter(JSON.parse(text.replace(/^\uFEFF/, "")));
}

export function convertCharacter(source) {
  const name = string(source?.Name);
  if (!name || !Number.isInteger(source.Version) || !list(source.PrimaryAttributes).length) {
    throw new Error("Die Datei enthält keinen erkennbaren Pedipalpus-Charakter.");
  }
  const attributes = ["primary", "secondary"].flatMap(kind =>
    list(source[kind === "primary" ? "PrimaryAttributes" : "SecondaryAttributes"])
      .map(row => ({ name: string(row.LongName), key: string(row.ShortName), value: attributeValue(row), kind }))
      .filter(row => row.name));
  const attributesByKey = new Map(attributes.map(row => [row.key, row]));
  const theorist = list(source.Disadvantages).some(row => germanKey(row.Name) === "theoretiker");
  const skills = Object.entries(SKILLS).flatMap(([field, group]) => list(source[field]).flatMap(row => {
    const name = string(row.Name);
    if (!name) return [];
    const checkAttributes = ["FirstAttribute", "SecondAttribute", "ThirdAttribute"].map(key => row[key])
      .filter(attribute => string(attribute?.LongName)).map(attribute =>
        attributesByKey.get(string(attribute.ShortName)) ??
        { name: string(attribute.LongName), key: string(attribute.ShortName), value: attributeValue(attribute) });
    const check = (name, value, rollName = "") => ({ name, group, rollName,
      value: rollName && theorist && ["BodySkills", "CraftingSkills"].includes(field)
        ? Math.sign(value) * Math.round(Math.abs(value) / 2) : value,
      attributes: checkAttributes, rollable: Boolean(rollName) && checkAttributes.length === 3 });
    const value = integer(row.TotalValue ?? row.Value);
    const rootRoll = SINGLE_CHECKS.has(field) && (field !== "Rituals" || row.HasCheck !== false);
    return [check(name, value, rootRoll ? name : ""), ...list(row.Subskills).filter(sub => string(sub.Name))
      .map(sub => check(name + " – " + sub.Name, integer(sub.TotalValue ?? (value + integer(sub.BaseValue))),
        MUNDANE_SPECIALIZATIONS.has(field) ? string(sub.Name) : ""))];
  }));
  const system = {
    sourceVersion: source.Version, sourceName: name, race: string(source.Race?.Name),
    reaction: positive(source.Re), impairment: positive(source.Be), attributes, skills,
    offensiveFocus: integer(source.OffOffset), defensiveFocus: integer(source.DefOffset),
    derived: list(source.DerivedValues).filter(row => string(row.LongName))
      .map(row => ({ name: string(row.LongName), key: string(row.ShortName), value: number(row.TotalValue) })),
    energies: ["LE", "AE", "KE"].filter(key => key === "LE" || (key === "AE" ? source.HasMana : source.HasKarma))
      .map(key => ({ key, value: integer(source["Current" + key]) })),
    hasJointPenalty: list(source.Disadvantages).some(row => germanKey(row.Name) === "schlechte gelenke")
  };
  const items = Object.entries(EQUIPMENT).flatMap(([field, group]) =>
    list(source[field]).flatMap(row => equipment(source, row, group)));
  return { name, type: "character", system, items, prototypeToken: { name, actorLink: true } };
}
