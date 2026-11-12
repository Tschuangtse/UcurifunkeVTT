// Grundregelwerk, Kapitel „Handlungen im Kampf“.
// null means that the GM supplies the COMPLETE tick cost, including modifiers.
export const CATEGORIES = [
  { id: "offensive", label: "Offensiv", title: "Offensive Handlungen", icon: "fa-solid fa-khanda", actions: [
    { id: "melee", name: "Nahkampfangriff", ticks: null, hint: "Waffengeschwindigkeit in Ticks." },
    { id: "opportunity", name: "Gelegenheitsangriff", ticks: null, hint: "Halbe Waffengeschwindigkeit in Ticks." },
    { id: "ranged", name: "Fernkampfangriff", ticks: 4 },
    { id: "approach", name: "Annähern", ticks: null, hint: "Waffengeschwindigkeit in Ticks." },
    { id: "retreat", name: "Entfernen", ticks: 8 },
    { id: "ram", name: "Rammen", ticks: null, hint: "Gesamtkosten: 4 Ticks + Anzahl der Felder Distanz. Die 4 Ticks des Verteidigers werden separat verbucht." }
  ] },
  { id: "defensive", label: "Defensiv", title: "Defensive Handlungen", icon: "fa-solid fa-shield-halved", actions: [
    { id: "dodge", name: "Ausweichen", ticks: 4 },
    { id: "intervene", name: "Dazwischengehen", ticks: 8 },
    { id: "parry", name: "Parade", ticks: 4 },
    { id: "parry-maneuver", name: "Parade mit Manöver", ticks: 8 },
    { id: "allow-hit", name: "Treffer zulassen", ticks: 0 }
  ] },
  { id: "movement", label: "Bewegung", title: "Bewegungshandlungen", icon: "fa-solid fa-person-walking", actions: [
    { id: "stand", name: "Aufstehen", ticks: 6, hint: "Je Positionswechsel: liegend → kniend oder kniend → stehend." },
    { id: "crawl", name: "Kriechen", ticks: 4 },
    { id: "make-room", name: "Platz machen", ticks: 2 },
    { id: "step", name: "Schritt", ticks: 2, hint: "Umdrehen ist beim Schritt kostenlos enthalten." },
    { id: "run", name: "Rennen", ticks: 4 },
    { id: "turn", name: "Umdrehen", ticks: 1, hint: "Je Drehung um 45°." },
    { id: "pull-back", name: "Zurückreißen", ticks: 8, hint: "8 Ticks für den Anwender. Die 4 Ticks des Ziels werden separat verbucht." }
  ] },
  { id: "tactical", label: "Taktisch", title: "Taktische Handlungen", icon: "fa-solid fa-chess", actions: [
    { id: "coordinate", name: "Absprache", ticks: 4 },
    { id: "cover", name: "Deckung nehmen", ticks: 4 },
    { id: "skill", name: "Fertigkeit nutzen", ticks: null, hint: "Dauer der Fertigkeit, des Zaubers oder Wunders; sonst 8 Ticks." },
    { id: "formation", name: "Formation einnehmen", ticks: 8, hint: "Jedes Mitglied bringt seine Ticks einzeln auf." },
    { id: "style", name: "Kampfstil wechseln", ticks: 4 },
    { id: "stance", name: "Haltung wechseln", ticks: 4 },
    { id: "reload", name: "Nachladen", ticks: null, hint: "Ladezeit der Fernkampfwaffe in Ticks." },
    { id: "hand", name: "Waffenhand wechseln / Waffe reichen", ticks: 4, hint: "Beim Reichen müssen beide Akteure die Handlung einzeln durchführen." },
    { id: "draw", name: "Waffe ziehen", ticks: null, hint: "Einhändig: Seite 4, Rücken 8 Ticks. Zweihändig jeweils +4. Vom Boden: 4 Ticks. Sonderfertigkeiten berücksichtigen." },
    { id: "aim", name: "Zielen", ticks: 4, hint: "Je Zielschritt 4 Ticks und 1 Punkt Erleichterung. Höchstens vier Zielschritte pro Zielvorgang." }
  ] }
];

export const ACTIONS = new Map(CATEGORIES.flatMap(category => category.actions.map(action => [action.id, action])));
export const VARIABLE_COST = Object.freeze({ min: 0, max: 32, default: 8 });

export function parseCost(value) {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error("Bitte eine ganze Tickzahl von 0 bis 32 eingeben.");
  const number = Number(value);
  if (!Number.isInteger(number) || number < VARIABLE_COST.min || number > VARIABLE_COST.max) {
    throw new Error("Bitte eine ganze Tickzahl von 0 bis 32 eingeben.");
  }
  return number;
}
