import { escapeHtml } from "./check-card.js";
import { parseCharacter } from "./import-data.js";
import { conditionRows, SUPPRESSIONS } from "./conditions.js";
import { convertRetinue, retinueSource, syncRetinue } from "./retinue.js";

export function chooseCharacterFile(label) {
  const content = document.createElement("div");
  content.innerHTML = '<label>Pedipalpus-Charakterdatei <input type="file" name="character" accept=".json,application/json" required></label>';
  return foundry.applications.api.DialogV2.prompt({
    window: { title: "Pedipalpus-Charakter importieren" },
    content, modal: true, rejectClose: false,
    ok: { label, callback: (_event, button) => button.form.elements.namedItem("character").files[0] }
  });
}

function changes(before, after, label, describe) {
  const remaining = new Map();
  for (const row of before) {
    const key = label(row);
    if (!remaining.has(key)) remaining.set(key, []);
    remaining.get(key).push(describe(row));
  }
  const result = [];
  for (const row of after) {
    const key = label(row);
    const value = describe(row);
    const previous = remaining.get(key)?.shift();
    if (previous !== value) result.push([key, previous, value]);
  }
  for (const [key, values] of remaining) for (const value of values) result.push([key, value, undefined]);
  return result;
}

function itemDetails(item) {
  const data = item.system;
  return [data.group, "×" + data.quantity, data.container, data.damage,
    data.attack != null && "AT/FK " + data.attack, data.parry != null && "PA " + data.parry,
    data.speed != null && "WGS " + data.speed, data.reload != null && "Laden " + data.reload,
    data.protection > 0 && "RS " + data.protection, data.equipped && "angelegt", data.carried && "getragen",
    data.reach, data.weight > 0 && data.weight + " kg", data.description, data.properties].filter(Boolean).join(" · ");
}

export function describeImport(current, imported) {
  const a = current.system;
  const b = imported.system;
  const values = ["name", "race", "reaction", "impairment"].flatMap((key, index) => {
    const before = key === "name" ? current.name : a[key];
    const after = key === "name" ? imported.name : b[key];
    return before === after ? [] : [[["Name", "Abstammung", "RE", "BE"][index], before, after]];
  });
  const conditionDetails = row => row.staged ? [row.level, SUPPRESSIONS[row.suppression], "wirksam " + row.effective].join(" · ")
    : [row.active ? "Vorhanden" : "Nicht vorhanden", row.suppressed ? "Unterdrückt" : ""].filter(Boolean).join(" · ");
  return [
    ["Grundwerte", [...values, ...changes([...a.attributes, ...a.derived], [...b.attributes, ...b.derived], row => row.name, row => row.value)]],
    ["Fertigkeiten", changes(a.skills, b.skills, row => [row.group, row.name].filter(Boolean).join(" · "), row =>
      [row.value, ...(row.attributes ?? []).map(attribute => (attribute.key || attribute.name) + " " + attribute.value)].join(" · "))],
    ["Ausrüstung", changes(current.items, imported.items, row => row.name, itemDetails)],
    ["Zustände", changes(conditionRows(a), conditionRows(b), row => row.name, conditionDetails)]
  ];
}

export async function updatePedipalpusActor(actor) {
  if (!actor.isOwner || actor.isToken) return;
  const file = await chooseCharacterFile("Änderungen ansehen");
  if (!file || !actor.isOwner) return;
  const json = await file.text();
  const data = parseCharacter(json);
  const retinue = retinueSource(JSON.parse(json.replace(/^\uFEFF/, "")));
  const snapshot = () => {
    const { name, system, items } = actor.toObject();
    return { name, system, items };
  };
  const current = snapshot();
  const entries = convertRetinue(retinue);
  const preview = describeImport(current, data).map(([label, rows]) => `<details${rows.length && rows.length <= 8 ? " open" : ""}>
    <summary>${label} (${rows.length})</summary><ul>${rows.map(([name, before, after]) =>
      `<li><strong>${escapeHtml(name)}</strong> · ${before === undefined ? "Neu" : escapeHtml(before)}
      → ${after === undefined ? "Entfällt" : escapeHtml(after)}</li>`).join("")}</ul></details>`).join("")
    + (entries.length ? `<details open><summary>Gefolge (${entries.length})</summary><ul>${entries.map(({ data }) =>
      `<li>${escapeHtml(data.name)} · ${escapeHtml(data.system.companionKind)}</li>`).join("")}</ul></details>` : "");
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Änderungen an " + actor.name }, position: { width: 560 },
    content: `<div class="ucurifunke-import-preview">${preview}</div>`,
    yes: { label: "Charakter aktualisieren" }, modal: true, rejectClose: false
  });
  if (!confirmed || !actor.isOwner) return;
  if (JSON.stringify(snapshot()) !== JSON.stringify(current)) throw new Error("Der Charakter wurde zwischenzeitlich geändert. Bitte den Import erneut öffnen.");
  await actor.importPedipalpusData(data);
  const pending = await syncRetinue(actor, retinue);
  if (pending.length) ui.notifications.warn("Gefolge zur Übernahme durch die Spielleitung vorgemerkt: " + pending.join(", "));
  ui.notifications.info("Charakter aus Pedipalpus aktualisiert.");
}
