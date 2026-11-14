import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml } from "./check-card.js";
import { parseCharacter } from "./import-data.js";
import { conditionRows, SUPPRESSIONS } from "./conditions.js";
import { planRetinue, retinueSource, syncRetinue } from "./retinue.js";
import { convertNpc, isNpcFile, npcRetinue } from "./npc-import.js";
import { energyRows } from "./energy.js";

export function chooseCharacterFile(label, { chooseFolder = false } = {}) {
  const content = document.createElement("div");
  content.innerHTML = '<label>Pedipalpus- oder NSCGenerator-Datei <input type="file" name="character" accept=".json,application/json" required></label>' +
    '<label>Charakterporträt (optional) <input type="file" name="portrait" accept="image/png,image/jpeg,image/webp"></label>';
  if (chooseFolder) {
    const label = document.createElement("label");
    label.textContent = "Akteursordner ";
    const select = document.createElement("select");
    select.name = "folder";
    select.add(new Option("Akteursverzeichnis", ""));
    for (const folder of game.folders.filter(folder => folder.type === "Actor" && folder.visible)) {
      const path = [folder.name];
      for (let parent = folder.folder; parent; parent = parent.folder) path.unshift(parent.name);
      select.add(new Option(path.join(" / "), folder.id));
    }
    label.append(select);
    content.append(label);
  }
  return foundry.applications.api.DialogV2.prompt({
    classes: SYSTEM_DIALOG_CLASSES,
    window: { title: "Pedipalpus-Charakter importieren" },
    content, modal: true, rejectClose: false,
    ok: { label, callback: (_event, button) => ({
      file: button.form.elements.namedItem("character").files[0],
      portrait: button.form.elements.namedItem("portrait").files[0],
      folder: button.form.elements.namedItem("folder")?.value || undefined
    }) }
  });
}

export async function applyCharacterPortrait(actor, portrait) {
  if (!portrait || actor.type !== "character") return;
  const types = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const extension = types[portrait.type];
  if (!extension || portrait.size > 10 * 1024 * 1024 || !game.user.can("FILES_UPLOAD")) {
    ui.notifications.warn("Porträt nicht übernommen. Erforderlich sind Uploadrechte und PNG, JPG oder WebP bis 10 MB.");
    return;
  }
  try {
    const picker = foundry.applications.apps.FilePicker.implementation;
    const path = "worlds/" + game.world.id;
    const file = new File([portrait], "ucurifunke-portrait-" + actor.id + "-" + foundry.utils.randomID() + "." + extension, { type: portrait.type });
    const uploaded = await picker.upload("data", path, file, {}, { notify: false });
    if (!uploaded?.path) throw new Error("Der Upload hat keinen Dateipfad zurückgegeben.");
    await actor.update({ img: uploaded.path });
  } catch (error) { ui.notifications.warn("Porträt nicht übernommen: " + error.message); }
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
  const { file, portrait } = await chooseCharacterFile("Änderungen ansehen") ?? {};
  if (!file || !actor.isOwner) return;
  const json = await file.text();
  const source = JSON.parse(json.replace(/^\uFEFF/, ""));
  const npc = isNpcFile(source);
  if (npc && actor.type !== "npc") throw new Error("NSC-Dateien können nur in Akteure vom Typ NSC importiert werden.");
  const data = npc ? convertNpc(source) : parseCharacter(json);
  const retinue = retinueSource(npc ? npcRetinue(source) : source);
  const snapshot = () => {
    const { name, system, items } = actor.toObject();
    return { name, system, items };
  };
  const current = snapshot();
  const { entries, removed } = planRetinue(actor, retinue);
  const preview = describeImport(current, data).map(([label, rows]) => `<details${rows.length && rows.length <= 8 ? " open" : ""}>
    <summary>${label} (${rows.length})</summary><ul>${rows.map(([name, before, after]) =>
      `<li><strong>${escapeHtml(name)}</strong> · ${before === undefined ? "Neu" : escapeHtml(before)}
      → ${after === undefined ? "Entfällt" : escapeHtml(after)}</li>`).join("")}</ul></details>`).join("")
    + (entries.length || removed.length ? `<details open><summary>Gefolge (${entries.length})</summary><ul>${entries.map(({ data }) =>
      `<li>${escapeHtml(data.name)} · ${escapeHtml(data.system.companionKind)}</li>`).join("")}${removed.map(actor =>
      `<li>${escapeHtml(actor.name)} · Akteur und Token werden entfernt</li>`).join("")}</ul></details>` : "");
  const hasEnergy = energyRows(current.system).length || entries.length;
  const confirmed = await foundry.applications.api.DialogV2.input({
    classes: SYSTEM_DIALOG_CLASSES,
    window: { title: "Änderungen an " + actor.name }, position: { width: 560 },
    content: `<div><div class="ucurifunke-import-preview">${preview}</div>
      ${hasEnergy ? '<label><input type="checkbox" name="keepEnergy" checked> LE, AE, KE und Schadensübersicht beibehalten</label>' : ""}</div>`,
    ok: { label: "Charakter aktualisieren" }, modal: true, rejectClose: false
  });
  if (!confirmed || !actor.isOwner) return;
  if (JSON.stringify(snapshot()) !== JSON.stringify(current)) throw new Error("Der Charakter wurde zwischenzeitlich geändert. Bitte den Import erneut öffnen.");
  if (planRetinue(actor, retinue).removed.map(a => a.id).join() !== removed.map(a => a.id).join()) {
    throw new Error("Das Gefolge wurde zwischenzeitlich geändert. Bitte den Import erneut öffnen.");
  }
  const keepEnergy = [true, "true", "on", 1, "1"].includes(confirmed.keepEnergy);
  await actor.importPedipalpusData(data, { keepEnergy });
  if (!npc) await applyCharacterPortrait(actor, portrait);
  const pending = await syncRetinue(actor, retinue, { keepEnergy });
  if (pending.length) ui.notifications.warn("Gefolge zur Übernahme durch die Spielleitung vorgemerkt: " + pending.join(", "));
  ui.notifications.info("Charakter aus Pedipalpus aktualisiert.");
}
