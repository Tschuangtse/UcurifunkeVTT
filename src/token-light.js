import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml as esc } from "./check-card.js";
import { DEFAULT_LIGHT_PRESETS, campaignLightPresets, lightUpdate, validateLight, validatePresetName } from "./light-presets.js";

const scope = "ucurifunke";
const animations = () => Object.keys(CONFIG.Canvas.lightAnimations);
const presets = () => campaignLightPresets(game.users, animations());
const dialogs = new Map();
const pending = new Set();
const initialLight = token => token.actor?.getFlag(scope, "lastTokenLight")
  ?? token.getFlag(scope, "lastTokenLight") ?? DEFAULT_LIGHT_PRESETS[0];
const owned = token => token.isOwner && (!token.actor || token.actor.isOwner);

async function applyLight(token, values) {
  if (!owned(token)) throw new Error("Du benötigst Besitzrechte für diesen Token.");
  const light = validateLight(values, animations());
  const last = { ...light, presetId: values.presetId ?? values.id ?? "" };
  await token.update({ ...lightUpdate(light), [`flags.${scope}.lastTokenLight`]: last });
  if (token.actor) await token.actor.setFlag(scope, "lastTokenLight", last);
}

async function savePreset(values, id, name) {
  const library = presets();
  const light = validateLight(values, animations());
  const label = validatePresetName(name, library, id);
  if (id && !library.some(preset => preset.id === id)) throw new Error("Das ausgewählte Preset existiert nicht mehr.");
  id ||= foundry.utils.randomID();
  const revision = Math.max(Date.now(), ...library.map(preset => preset.revision + 1));
  await game.user.setFlag(scope, `lightPresets.${id}`, { ...light, name: label, revision });
  return id;
}

function optionMarkup(selected) {
  return '<option value="">Eigene Einstellung</option>' + presets().map(preset =>
    `<option value="${esc(preset.id)}"${preset.id === selected ? " selected" : ""}>${esc(preset.name)}</option>`).join("");
}

class TokenLightDialog extends foundry.applications.api.DialogV2 {
  constructor(token) {
    const light = initialLight(token);
    const prefix = `uq-light-${token.id}`;
    const animationOptions = '<option value="">Keine</option>' + Object.entries(CONFIG.Canvas.lightAnimations)
      .map(([id, config]) => `<option value="${esc(id)}">${esc(game.i18n.localize(config.label))}</option>`).join("");
    super({ classes: [...SYSTEM_DIALOG_CLASSES, "ucurifunke-light-dialog"],
      window: { title: `Lichtquelle · ${token.name}` }, position: { width: 500 }, form: { closeOnSubmit: false },
      content: `<div><div class="ucurifunke-light-fields">
        <label for="uq-light-preset">Preset</label><select id="uq-light-preset" name="presetId">${optionMarkup(light.presetId ?? light.id)}</select>
        <label for="uq-light-bright">Lichtstufe</label><input id="uq-light-bright" type="number" name="bright" min="0" max="16" step="1" value="4" required>
        <span>Gedämpftes Licht</span><output data-dim></output>
        <label for="uq-light-color">Lichtfarbe</label><input id="uq-light-color" type="color" name="color" value="#ffc314" required>
        <label for="uq-light-type">Animation</label><select id="uq-light-type" name="type">${animationOptions}</select>
        <label for="uq-light-speed">Geschwindigkeit</label><input id="uq-light-speed" type="number" name="speed" min="0" max="10" step="1" value="2" required>
        <label for="uq-light-intensity">Intensität</label><input id="uq-light-intensity" type="number" name="intensity" min="1" max="10" step="1" value="5" required>
        </div>
        <label class="ucurifunke-light-new"><input name="newPreset" type="checkbox">Als neues Kampagnen-Preset speichern</label>
        <div class="ucurifunke-light-fields" data-new-preset hidden>
          <label for="uq-light-name">Name</label><input id="uq-light-name" name="presetName" type="text" maxlength="80" disabled>
        </div><p class="ucurifunke-light-error" role="alert" hidden></p></div>`
        .replaceAll('id="uq-light-', `id="${prefix}-`).replaceAll('for="uq-light-', `for="${prefix}-`),
      buttons: [
        { action: "apply", label: "Licht anwenden", icon: "fa-solid fa-fire-flame-curved", default: true,
          callback: async () => { if (await this.submitLight(false)) await this.close(); } },
        { action: "savePreset", label: "Preset aktualisieren", icon: "fa-solid fa-floppy-disk",
          callback: () => this.submitLight(true) }
      ]
    });
    this.token = token;
    this.light = light;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.lightForm = this.element.querySelector("form");
    this.fields = this.lightForm.elements;
    for (const key of ["bright", "color", "type", "speed", "intensity"]) this.fields[key].value = this.light[key];
    this.lightForm.addEventListener("input", () => this.refresh());
    this.fields.presetId.addEventListener("change", () => {
      const preset = presets().find(entry => entry.id === this.fields.presetId.value);
      if (preset) for (const key of ["bright", "color", "type", "speed", "intensity"]) this.fields[key].value = preset[key];
      this.refresh();
    });
    this.refresh();
  }

  refreshPresets() {
    if (!this.rendered) return;
    this.fields.presetId.innerHTML = optionMarkup(this.fields.presetId.value);
    this.refresh();
  }

  values() {
    return Object.fromEntries(["bright", "color", "type", "speed", "intensity", "presetId"]
      .map(key => [key, this.fields[key].value]));
  }

  refresh() {
    const create = this.fields.newPreset.checked;
    this.element.querySelector("[data-new-preset]").hidden = !create;
    this.fields.presetName.disabled = !create;
    this.fields.presetName.required = create;
    const dim = Number(this.fields.bright.value) * 1.5;
    this.element.querySelector("[data-dim]").textContent = this.fields.bright.validity.valid
      ? dim.toLocaleString("de-DE") : "–";
    let error = "";
    try {
      validateLight(this.values(), animations());
      if (create) validatePresetName(this.fields.presetName.value, presets());
    } catch (failure) { error = failure.message; }
    const message = this.element.querySelector("[role=alert]");
    message.textContent = error;
    message.hidden = !error;
    this.element.querySelector('[data-action="apply"]').disabled = Boolean(error) || this.busy;
    this.element.querySelector('[data-action="savePreset"]').disabled = Boolean(error) || create || !this.fields.presetId.value || this.busy;
  }

  async submitLight(updatePreset) {
    if (this.busy) return false;
    this.busy = true;
    this.refresh();
    try {
      const values = this.values();
      validateLight(values, animations());
      if (updatePreset) {
        const preset = presets().find(entry => entry.id === values.presetId);
        await savePreset(values, preset?.id, preset?.name);
        ui.notifications.info("Kampagnen-Preset aktualisiert.");
      } else {
        if (this.fields.newPreset.checked) values.presetId = await savePreset(values, null, this.fields.presetName.value);
        await applyLight(this.token, values);
      }
      return true;
    } catch (error) {
      ui.notifications.error(error.message);
      return false;
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  async close(options) {
    await super.close(options);
    if (dialogs.get(this.token.uuid) === this) dialogs.delete(this.token.uuid);
  }
}

function decorateLight(hud, html) {
  html.querySelector(".ucurifunke-token-light")?.remove();
  const token = hud.document;
  const right = html.querySelector(".col.right");
  if (!token || !owned(token) || !right) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon ucurifunke-token-light";
  button.ariaLabel = "Lichtquelle · Klick anwenden, Rechtsklick bearbeiten";
  button.dataset.tooltipText = button.ariaLabel;
  button.innerHTML = '<i class="fa-solid fa-fire-flame-curved" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (pending.has(token.uuid)) return;
    pending.add(token.uuid);
    void applyLight(token, initialLight(token)).catch(error => ui.notifications.error(error.message))
      .finally(() => pending.delete(token.uuid));
  });
  button.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    let dialog = dialogs.get(token.uuid);
    if (dialog?.rendered) { dialog.bringToFront(); return; }
    if (!dialog) { dialog = new TokenLightDialog(token); dialogs.set(token.uuid, dialog); }
    void dialog.render({ force: true });
  });
  right.append(button);
}

Hooks.on("renderTokenHUD", decorateLight);
Hooks.on("updateUser", (_user, changes) => {
  if (changes.flags?.ucurifunke?.lightPresets) for (const dialog of dialogs.values()) dialog.refreshPresets();
});
