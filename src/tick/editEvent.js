import { strings, t } from "./i18n.js";
const TEMPLATE = "systems/ucurifunke/templates/editEvent.hbs";

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function editEvent(sourceData, callback) {
  const data = { ...sourceData };
  data.isNew = !Object.hasOwn(data, "id");

  const title = data.isEvent
    ? (data.isNew ? t("newEvent") : t("editEvent"))
    : (data.isNew ? t("newCombatant") : t("editCombatant"));

  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, { ...data, labels: strings() });
  const content = document.createElement("div");
  content.innerHTML = `<div class="tick-combat-dialog">${html}</div>`;

  const result = await foundry.applications.api.DialogV2.input({
    window: { title },
    content,
    modal: true,
    rejectClose: false,
    ok: {
      label: t("ok"),
      icon: "fa-solid fa-check"
    }
  });

  if (!result) return null;

  const updated = {
    ...data,
    name: String(result.name ?? data.name ?? ""),
    notes: String(result.notes ?? ""),
    ticks: toInteger(result.ticks, data.ticks ?? 0)
  };

  if (data.isEvent) {
    updated.repeating = Boolean(result.repeating);
    updated.ffwd = updated.repeating ? toInteger(result.ffwd, data.ffwd ?? 8) : -1;
  }

  if (callback) await callback(updated);
  return updated;
}
