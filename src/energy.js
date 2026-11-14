import { conditionRows } from "./conditions.js";
export const DAMAGE_SOURCES = { injury: "Verletzungen", poison: "Gifte", illness: "Krankheiten", bloodmagic: "Blutmagie" };
export const ENERGY_KEYS = ["LE", "AE", "KE"];
const number = v => Number.isFinite(v) ? Math.trunc(v) : 0;
const bound = (v, min, max) => Math.max(min, Math.min(max, number(Number(v))));
const key = v => String(v ?? "").toLowerCase().replaceAll("ä","ae").replaceAll("ö","oe").replaceAll("ü","ue").replaceAll("ß","ss");
export function energyRows(data = {}) {
  return ENERGY_KEYS.flatMap(code => {
    const saved = data.energies?.find(r => r.key === code);
    const detail = data.companionDetails?.find(r => r.name === code)?.value.match(/^(-?\d+)\s*\/\s*(\d+)$/);
    const max = Math.max(0, Math.round(saved?.max ?? data.derived?.find(r => r.key === code)?.value ?? Number(detail?.[2] ?? 0)));
    return saved || max > 0 ? [{ key: code, max, value: saved?.value ?? Number(detail?.[1] ?? max) }] : [];
  });
}
export function readDamage(source) {
  if (!source.HealthDamageTrackingInitialized) return Object.entries(DAMAGE_SOURCES).flatMap(([field, name]) => {
    const amount = number(source["LeLoss" + field[0].toUpperCase() + field.slice(1)]);
    return amount > 0 ? [{ source: name, original: amount, remaining: amount, timestamp: "" }] : [];
  });
  return (source.HealthDamageEntries ?? []).filter(Boolean).flatMap(row => row.OriginalDamage > 0 && row.RemainingDamage > 0
    ? [{ source: row.Source ?? "", original: row.OriginalDamage, remaining: Math.min(row.RemainingDamage,row.OriginalDamage), timestamp: row.Timestamp ?? "" }] : []);
}
export function damageRows(data) {
  if (data.damage?.length) return data.damage.map(row => ({ ...row }));
  const le = energyRows(data).find(row => row.key === "LE");
  const missing = le ? le.max - le.value : 0;
  return missing > 0 ? [{ source: "Unbekannte Quelle", original: missing, remaining: missing, timestamp: "" }] : [];
}
export const isWound = (row, threshold) => row.original > threshold && row.remaining * 2 > row.original;
export function regenerationTraits(source) {
  const level = (rows, name) => Math.max(0, ...(rows ?? []).filter(r => key(r.Name).startsWith(key(name))).map(r => {
    const numeral = r.Name.match(/\b(VI|IV|III|II|V|I|[1-6])\b/i)?.[1]?.toUpperCase();
    return Math.max(number(r.Level), { I:1,II:2,III:3,IV:4,V:5,VI:6 }[numeral] ?? Number(numeral ?? 0));
  }));
  const has = (rows, name) => (rows ?? []).some(r => key(r.Name).startsWith(key(name)));
  const a=source.Advantages, d=source.Disadvantages, m=source.MagicalSpecialSkills;
  const nonSleeper=level(a,"Nicht-Schläfer"), astralRegenerationLevel=level(m,"Astrale Regeneration");
  return { nonSleeper, required: nonSleeper >= 2 ? 0 : has(d,"Langschläfer") ? 8 : has(a,"Kurzschläfer") ? 4 : 6,
    fastHealing:has(a,"Schnelle Heilung"), sleepDisorder:has(d,"Schlafstörung"), metalAffinity:has(a,"Metallaffiner Zauberer"),
    severeIronBan:has(d,"Schwerer Bann des Eisens"), penance:has(d,"Bußqueste"), astralRegenerationLevel,
    useLeyLines:level(m,"Kraftlinienmagie")>0, ordinationRank: Math.max(1,number(source.ChurchRank),level(source.DivineSpecialSkills,"Weihegrad")) };
}
export function regenerationDefaults(data) {
  const traits = data.regeneration ?? {};
  return { ...traits, restHours: traits.required ?? 6, meditated: traits.astralRegenerationLevel > 0,
    sick: conditionRows(data).some(r=>r.key==="krank"&&r.effective), ordinationRank:traits.ordinationRank || 1 };
}
export function regenerationAmounts(data, options) {
  const energies = energyRows(data);
  const row = code => energies.find(r=>r.key===code);
  const le = row("LE");
  const enough = Number(options.restHours) >= (data.regeneration?.required ?? 6)
    && !(data.regeneration?.nonSleeper === 1 && options.sleepDebt);
  const rest = bound(options.camp,0,3)+bound(options.bed,0,3)-Number(Boolean(options.interrupted));
  const fast = options.fastHealing && le ? Math.ceil(Math.max(0,le.max-le.value)/5) : 0;
  const LE = options.preventLE || !enough || options.sick && !options.healDespiteSickness ? 0
    : Math.max(0, rest+fast-Number(Boolean(options.sleepDisorder))+bound(options.additionalLE,0,1000));
  let AE=0;
  if (row("AE") && !options.preventAE && enough && !options.sick && !(options.ironExposure && options.severeIronBan)) {
    AE=Math.max(0,rest)+(options.useLeyLines?bound(options.leyLineStrength,0,3):0);
    if(options.meditated) AE+=Math.min(AE,bound(options.astralRegenerationLevel,0,6));
    if(options.ironExposure && (!options.metalAffinity || options.ironDuringRest)) AE=Math.ceil(AE/2);
  }
  const naturalKE=row("KE")&&!options.preventKE&&enough&&!options.divineBlock?bound(options.ordinationRank,1,5):0;
  const refund=row("KE")?bound(options.karmaRefund,0,1000):0;
  const amounts={LE,AE,KE:naturalKE+refund};
  return {amounts,naturalKE,refund,fast,gains:Object.fromEntries(energies.map(r=>[r.key,Math.max(0,Math.min(amounts[r.key],r.max-r.value))]))};
}
export function regenerate(data, options) {
  const { amounts, gains } = regenerationAmounts(data,options);
  const energies=energyRows(data), damage=damageRows(data);
  let heal=amounts.LE;
  const rank = row => Number(key(row.source)!=="blutmagie");
  for(const row of [...damage].sort((a,b)=>rank(a)-rank(b)||(a.timestamp||"").localeCompare(b.timestamp||""))) {
    const amount=Math.min(heal,row.remaining);
    row.remaining-=amount;
    heal-=amount;
  }
  return {
    energies: energies.map(row => ({ ...row, value: row.key === "LE" && amounts.LE > 0
      ? row.max - damage.reduce((sum, entry) => sum + entry.remaining, 0)
      : row.value + (gains[row.key] ?? 0) })),
    damage: damage.filter(row=>row.remaining>0)
  };
}
