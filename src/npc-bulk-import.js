import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml } from "./check-card.js";
import { createNpcActor } from "./npc-import.js";

let importing = false;

export async function importNpcGroup() {
  if (importing || !game.user.isGM) return;
  importing = true;
  const { DialogV2 } = foundry.applications.api;
  let folder;
  try {
    const name = await DialogV2.prompt({
      classes: SYSTEM_DIALOG_CLASSES,
      window: { title: "NSC Massenimport" },
      content: '<label>Gruppenname <input type="text" name="group" required autofocus></label>',
      modal: true, rejectClose: false,
      ok: { label: "Ordner anlegen", callback: (_event, button) => button.form.elements.group.value.trim() }
    });
    if (name == null) return;
    if (!name) throw new Error("Bitte einen Gruppennamen eingeben.");
    if (!game.user.isGM) return;
    folder = await foundry.documents.Folder.implementation.create({ name, type: "Actor" });
    if (!folder) throw new Error("Der Akteursordner konnte nicht angelegt werden.");
    const files = await DialogV2.prompt({
      classes: SYSTEM_DIALOG_CLASSES,
      window: { title: "NSC-Dateien auswählen" },
      content: '<label>Dateien aus dem NSCGenerator <input type="file" name="npcs" accept=".json,application/json" multiple required></label>',
      modal: true, rejectClose: false,
      ok: { label: "Importieren", callback: (_event, button) => Array.from(button.form.elements.npcs.files) }
    });
    if (!files?.length || !game.user.isGM) return;
    const issues = [];
    let imported = 0;
    for (const file of files) {
      try {
        const source = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
        const { pending } = await createNpcActor(source, folder.id);
        imported++;
        if (pending.length) issues.push([file.name, "Gefolge vorgemerkt: " + pending.join(", ")]);
      } catch (error) {
        issues.push([file.name, error.message]);
      }
    }
    const summary = `${imported} von ${files.length} NSC importiert.`;
    if (!issues.length) ui.notifications.info(summary);
    else await DialogV2.prompt({
      classes: SYSTEM_DIALOG_CLASSES,
      window: { title: "Ergebnis des NSC-Massenimports" },
      content: `<p>${summary}</p><ul>${issues.map(([file, message]) =>
        `<li><strong>${escapeHtml(file)}</strong> – ${escapeHtml(message)}</li>`).join("")}</ul>`,
      ok: { label: "Schließen" }, rejectClose: false
    });
  } catch (error) {
    ui.notifications.error(error.message);
  } finally {
    try {
      if (folder && !folder.contents.length && !game.folders.some(child => child.folder?.id === folder.id)) await folder.delete();
    } catch (error) {
      ui.notifications.warn("Der leere Importordner konnte nicht entfernt werden: " + error.message);
    } finally {
      importing = false;
    }
  }
}
