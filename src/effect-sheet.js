import { EFFECT_TARGETS, validateEffect } from "./effect-rules.js";
import { escapeHtml as esc } from "./check-card.js";

const { api, sheets } = foundry.applications;
function rowMarkup(change, kind) {
  return `<div class="uq-effect-change" data-effect-row>
    <select data-target aria-label="Zielwert" required>${EFFECT_TARGETS.filter(target => !(kind === "continuous" && target.periodic || kind === "periodic" && target.continuous)).map(target => `<option value="${target.key}" ${target.key === change.target ? "selected" : ""}>${esc(target.label)}</option>`).join("")}</select>
    <select data-mode aria-label="Berechnung"><option value="add" ${change.mode === "add" ? "selected" : ""}>Absolut (+/−)</option><option value="percent" ${change.mode === "percent" ? "selected" : ""}>Prozent (+/−)</option></select>
    <input data-value aria-label="Wert" type="number" min="-100000" max="100000" step="any" value="${change.value}" required>
    <button type="button" data-remove-change aria-label="Wirkung entfernen"><i class="fa-solid fa-trash" inert></i></button></div>`;
}

export class EffectSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = { classes: ["ucurifunke-dialog", "uq-effect-sheet"], tag: "form", position: { width: 700, height: 650 },
    window: { resizable: true }, form: { closeOnSubmit: false, submitOnChange: false } };
  static PARTS = { main: { template: "systems/ucurifunke/templates/effect.hbs" } };
  async _prepareContext(options) {
    return { ...await super._prepareContext(options), name: this.item.name, data: this.item.system,
      continuous: this.item.system.kind === "continuous", editable: this.isEditable };
  }
  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element, data = this.item.system;
    const rows = form.querySelector("[data-effect-changes]");
    const kind = form.querySelector('[name="system.kind"]');
    rows.innerHTML = data.changes.map(change => rowMarkup(change, data.kind)).join("");
    form.querySelector("[data-add-change]").onclick = () => rows.insertAdjacentHTML("beforeend", rowMarkup({ target: kind.value === "continuous" ? "actionTicks" : "LE", mode: "add", value: 1 }, kind.value));
    rows.onclick = event => { if (this.isEditable && event.target.closest("[data-remove-change]")) event.target.closest("[data-effect-row]").remove(); };
    kind.onchange = () => {
      const current = [...rows.children].map(row => ({ target: row.querySelector("[data-target]").value, mode: row.querySelector("[data-mode]").value, value: Number(row.querySelector("[data-value]").value) }));
      rows.innerHTML = current.map(change => rowMarkup(change, kind.value)).join("");
    };
    if (!this.isEditable) for (const input of form.querySelectorAll("input,textarea,select,button[type=submit],[data-add-change],[data-remove-change]")) input.disabled = true;
  }
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    data.system.changes = [...form.querySelectorAll("[data-effect-row]")].map(row => ({ target: row.querySelector("[data-target]").value,
      mode: row.querySelector("[data-mode]").value, value: Number(row.querySelector("[data-value]").value) }));
    data.system = validateEffect(data.system);
    return data;
  }
}
