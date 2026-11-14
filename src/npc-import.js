import { retinueSource, syncRetinue } from "./retinue.js";

const PRIMARY = ["MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"];
const GRADES = ["Amateur", "Lehrling", "Geselle", "Meister", "Legende"];
const grade = name => (GRADES.indexOf(name) + 1) * 4;
const num = value => Number.isFinite(value) ? value : 0;
const round = value => Math.sign(value) * Math.round(Math.abs(value));
const total = row => num(row.BaseValue) + num(row.RaceModifier) + num(row.Modifier);
const split = (value = "") => value.split(";").map(s => s.trim()).filter(Boolean);
const key = value => value.toLowerCase().replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss");

export const isNpcFile = source => source?.Format === "Pedipalpus.Npc";

export function convertNpc(source) {
  const npc = source.Npc;
  const fields = ["Attributes", "Derived", "Abilities", "Features", "Techniques", "Weapons", "Armors", "Powers", "Conditions", "Retinue"];
  if (!isNpcFile(source) || source.Version !== 1 || typeof npc?.Name !== "string" || !npc.Name.trim()
    || fields.some(field => !Array.isArray(npc[field]) || npc[field].some(row => !row || typeof row !== "object"))) {
    throw new Error("Keine unterstützte NSC-Datei (Pedipalpus.Npc, Version 1).");
  }
  const attributes = npc.Attributes.map(row => ({ key: row.Key, name: row.Name, value: total(row),
    kind: PRIMARY.includes(row.Key) ? "primary" : "secondary" }));
  const byKey = new Map(attributes.map(row => [row.key, row]));
  if (attributes.length !== 11 || byKey.size !== 11 || [...PRIMARY, "gMR", "kMR", "RE"].some(code => !byKey.has(code))) {
    throw new Error("Die Attributstruktur der NSC-Datei ist unvollständig oder doppelt.");
  }
  const a = code => byKey.get(code).value;
  const raw = {
    LE: 15 + a("KO") * (npc.LifeFactor ?? 1), AE: (a("MU") + a("IN") + a("KO")) * Math.max(0, Math.min(5, num(npc.AstralBody))) * .2,
    KE: npc.Consecrated ? (a("MU") + a("IN") + a("CH")) / 2 * (npc.ConsecrationLevel === 1 ? .5 : 1) : 0,
    OFF: Math.max(0, (a("MU") + a("GE") + a("KK") - 5) / 5),
    DEF: Math.max(0, (a("IN") + a("GE") + a("KK") - 5) / 5),
    FKB: Math.max(0, (a("IN") + a("FF") + a("KK") - 5) / 5),
    WS: a("KO") / 2 + 1, TK: a("KO") / 2 + a("KK") + num(npc.RaceCarryBonus),
    GS: 8 + num(npc.RaceSpeed), BL: 2 * a("MU"), WA: (a("KL") + a("IN") + a("FF") + a("KO")) / 4 - 5
  };
  raw.AW = round(raw.DEF + num(npc.Derived.find(row => row.Key === "DEF")?.Modifier)) + a("RE");
  const derivedKeys = new Set(npc.Derived.map(row => row.Key));
  if (npc.Derived.length !== Object.keys(raw).length || Object.keys(raw).some(code => !derivedKeys.has(code))) {
    throw new Error("Die abgeleiteten NSC-Werte sind unvollständig oder doppelt.");
  }
  const derived = npc.Derived.map(row => ({ key: row.Key, name: row.Name, value: round(num(raw[row.Key]) + num(row.Modifier)) }));
  const d = code => derived.find(row => row.key === code)?.value ?? 0;
  const focus = num(npc.Focus);
  const skill = (row, group, value, attributes = [], rollable = false, description = row.Notes) =>
    ({ name: row.Name, group, value, attributes, rollable, rollName: row.Name, description: description ?? "" });
  const techniques = npc.Techniques.map(row => skill(row, row.Type === "Ranged" ? "Fernkampf" : "Nahkampf", row.Value));
  const skills = [...techniques, ...npc.Abilities.map(row => skill(row, "Aufgabenbereiche", grade(row.Grade), [], true)),
    ...npc.Features.map(row => skill(row, "Merkmale", grade(row.Grade))),
    ...npc.Powers.map(row => {
      const codes = [row.FirstAttribute, row.SecondAttribute, row.ThirdAttribute];
      const value = row.Grade === "Vom Merkmal"
        ? Math.max(0, ...npc.Features.filter(feature => split(row.Features).some(name => key(name) === key(feature.Name))).map(feature => grade(feature.Grade)))
        : grade(row.Grade);
      const valid = new Set(codes).size >= 2 && codes.every(code => PRIMARY.includes(code));
      return skill(row, row.Kind === "Liturgie" ? "Liturgien" : row.Kind === "Ritual" ? "Rituale" : "Zauber", value,
        valid ? codes.map(code => byKey.get(code)) : [], row.HasCheck !== false && value > 0 && valid,
        [row.Rules, row.Notes].filter(Boolean).join("\n"));
    })];
  const weapons = npc.Weapons.map((row, index) => {
    const ranged = row.Kind === "Fernkampf";
    const allowed = split(row.Techniques).map(key);
    const technique = techniques.filter(t => t.group === (ranged ? "Fernkampf" : "Nahkampf") && allowed.includes(key(t.name)))
      .sort((left, right) => right.value - left.value)[0];
    const mods = split(row.ParryModifiers).map(entry => Number(entry) || 0);
    const parry = num(row.DefenseBonus) + (mods.length ? mods[Math.max(0, Math.min(mods.length - 1, num(row.TrainingLevel)))] : num(row.ParryModifier));
    const attackBreakdown = technique ? [technique.value, d(ranged ? "FKB" : "OFF"), ranged ? 0 : focus, num(row.AttackModifier)] : [];
    const parryBreakdown = technique && !ranged ? [technique.value, d("DEF"), -focus, parry] : [];
    const sum = parts => parts.length ? parts.reduce((left, right) => left + right, 0) : null;
    const strength = /finesse/i.test(row.Notes ?? "") ? Math.max(a("KK"), a("GE")) : a("KK");
    const [threshold, step] = (row.TpKk ?? "").split("/").map(Number);
    const bonus = !ranged && step > 0 ? Math.max(0, Math.trunc((strength - threshold) / step)) : 0;
    return { name: row.Name, type: "weapon", system: { sourceId: "nsc:weapon:" + row.Name + ":" + index,
      group: row.Kind, carried: true, useAttackTicks: true, quantity: 1, weight: num(row.Weight), description: row.Notes ?? "",
      damage: row.Damage + (bonus ? " + " + bonus : ""), reach: row.Reach ?? "", speed: Math.max(0, num(row.AttackTicks)),
      reload: ranged ? Math.max(0, num(row.ReloadTicks)) : null, mobilityTolerance: Math.max(0, num(row.MobilityTolerance)),
      technique: technique?.name ?? "", attackBreakdown, parryBreakdown, attack: sum(attackBreakdown), parry: sum(parryBreakdown) } };
  });
  const armor = npc.Armors.map((row, index) => ({ name: row.Name, type: "equipment", system: {
    sourceId: "nsc:armor:" + row.Name + ":" + index, group: "Rüstung", carried: true, equipped: row.Equipped !== false,
    protection: Math.max(0, num(row.Protection)), mobilityPenalty: Math.max(0, num(row.MobilityPenalty)),
    quantity: 1, weight: num(row.Weight), description: row.Notes ?? ""
  } }));
  const conditions = npc.Conditions.map(row => ({ name: row.Name, staged: row.IsGraded, active: row.Active,
    level: row.IsGraded ? num(row.Level) : 0 }));
  return { name: npc.Name.trim(), type: "npc", prototypeToken: { name: npc.Name.trim(), actorLink: false },
    items: [...weapons, ...armor], system: { npcGenerator: true, sourceVersion: source.Version, race: npc.RaceName,
      attributes, derived, skills, conditions,
      energies: ["LE", "AE", "KE"].filter(key => key === "LE" || d(key) > 0)
        .map(key => ({ key, max: Math.max(0, d(key)), value: npc["Current" + key] ?? d(key) })),
      reaction: Math.max(0, a("RE")), offensiveFocus: focus, defensiveFocus: -focus,
      impairment: Math.max(0, num(npc.AdditionalImpairment) + npc.Armors.filter(row => row.Equipped !== false)
        .reduce((sum, row) => sum + Math.max(0, num(row.MobilityPenalty)), 0)),
      companionDetails: [["Kultur",npc.Culture],["Größenklasse",npc.SizeClass],["Repräsentation",npc.Representation],
        ["Gottheit",npc.Deity],["Notizen",npc.Notes],...["LE","AE","KE"].filter(code=>d(code)>0)
          .map(code=>[code,num(npc["Current"+code[0]+code[1].toLowerCase()])+" / "+d(code)])]
        .filter(([,value])=>value).map(([name,value])=>({name,value}))
    } };
}

export function npcRetinue(source) {
  const groups = { Tier:"Animals", Person:"Persons", Dämon:"Demons", Untoter:"Undead", Chimäre:"Chimeras",
    Elementar:"Elementals", Golem:"Golems" };
  const result = Object.fromEntries(Object.values(groups).map(group => [group, []]));
  for (const row of source.Npc.Retinue) {
    const group = groups[row.Kind] ?? "Persons";
    result[group].push({ ...row, Species: row.Category, SizeClass: row.Size, NaturalArmor: row.Armor,
      MentalMagicResistance: row.MentalResistance, PhysicalMagicResistance: row.PhysicalResistance,
      CurrentAstralEnergy: row.CurrentAe, AstralEnergy: row.MaxAe, SpecialProperties: row.Rules,
      ...Object.fromEntries(row.Attributes.map(attribute => [attribute.Key, total(attribute)])),
      MundaneAbilities: row.Abilities.map(ability => ({ ...ability, Value: grade(ability.Grade) })),
      Attacks: row.Attacks.map(attack => ({ ...attack, DamageExpression: attack.Damage }))
    });
  }
  return result;
}

export async function createNpcActor(source, folder, { groupRetinue = true } = {}) {
  const data = convertNpc(source);
  const retinue = retinueSource(npcRetinue(source));
  const actor = await foundry.documents.Actor.implementation.create({ ...data, ...(folder ? { folder } : {}) });
  if (!actor) throw new Error("Der NSC konnte nicht angelegt werden.");
  const pending = retinue.authoritative.some(group => retinue[group].length)
    ? await syncRetinue(actor, retinue, { folder: groupRetinue ? folder : undefined }) : [];
  return { actor, pending };
}
