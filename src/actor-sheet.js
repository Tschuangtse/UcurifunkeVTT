import { parseCharacter } from "./import-data.js";
import { postRoll, prepareRoll, weaponCheck } from "./checks.js";
import { escapeHtml } from "./check-card.js";
import { addActionTicks, assertSameSelection, getSelection } from "./actions/combat.js";
import { readTechniqueSettings, techniqueCheck, techniqueFlag, techniqueSettings } from "./technique-check.js";
import { attributeCheck, filterSheet, groupAttributes, groupItems, partitionSkills, perceptionAttributes,
  perceptionCheck, skillCheck } from "./sheet-view.js";

const { api, sheets } = foundry.applications;
const path = "systems/ucurifunke/templates/actor.hbs";

function perceptionFields(attributes, defaults) {
  return defaults.map((attribute, index) => {
    const options = attributes.map(row => {
      const key = row.key.toUpperCase();
      return `<option value="${escapeHtml(key)}"${row === attribute ? " selected" : ""}>${escapeHtml(row.name)}</option>`;
    }).join("");
    return `<div class="form-group"><label for="ucurifunke-attribute-${index}">Attribut ${index + 1}</label>
      <select id="ucurifunke-attribute-${index}" name="attribute${index}">${options}</select></div>`;
  }).join("");
}

function techniqueFields(settings, canBookTicks) {
  const fields = [
    ["tolerance", "Toleranz für Beeinträchtigung", "min=\"0\""],
    ["ticks", "Tickkosten", "min=\"0\" max=\"32\""],
    ["offensive", "Offensiver Bonus", ""],
    ["defensive", "Defensiver Bonus", ""]
  ].map(([key, label, range]) => `<div class="form-group"><label for="ucurifunke-${key}">${label}</label>
    <input id="ucurifunke-${key}" name="${key}" type="number" value="${escapeHtml(settings[key])}" step="1" ${range} required></div>`).join("");
  return fields + (canBookTicks ? `<div class="form-group">
    <label for="ucurifunke-book-ticks">Tickkosten im laufenden Kampf buchen</label>
    <input id="ucurifunke-book-ticks" name="bookTicks" type="checkbox"></div>` : "");
}

export async function importPedipalpus() {
  if (!game.user.can("ACTOR_CREATE")) return;
  const content = document.createElement("div");
  content.innerHTML = '<label>Pedipalpus-Charakterdatei <input type="file" name="character" accept=".json,application/json" required></label>';
  try {
    const file = await api.DialogV2.prompt({
      window: { title: "Pedipalpus-Charakter importieren" },
      content, modal: true, rejectClose: false,
      ok: {
        label: "Neuen Charakter erstellen",
        callback: (_event, button) => button.form.elements.namedItem("character").files[0]
      }
    });
    if (!file) return;
    const character = parseCharacter(await file.text());
    const actor = await foundry.documents.Actor.implementation.create(character);
    await actor?.sheet.render({ force: true });
  } catch (error) {
    ui.notifications.error(error.message);
  }
}

export class CharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  #activeTab = "overview";
  #filters = {};

  static DEFAULT_OPTIONS = {
    classes: ["ucurifunke-sheet"], position: { width: 710, height: 720 },
    actions: { rollCheck: CharacterSheet.#roll, saveCombatValues: CharacterSheet.#saveCombatValues,
      openSheetTab: CharacterSheet.#openTab }
  };

  static PARTS = { character: { template: path, scrollable: [".ucurifunke-sheet-body"] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = this.actor.system;
    const items = this.actor.items.map(item => {
      const weapon = item.type === "weapon";
      return {
        id: item.id, name: item.name, data: item.system, weapon,
        attack: weapon && Number.isInteger(item.system.attack),
        parry: weapon && Number.isInteger(item.system.parry),
        attackMode: item.system.group === "Fernkampf" ? "FK" : "AT",
        hasSpeed: Number.isInteger(item.system.speed), hasReload: Number.isInteger(item.system.reload)
      };
    });
    return { ...context, data, sheetId: this.id, actorName: this.actor.name, actorImage: this.actor.img,
      ...partitionSkills(data.skills),
      attributeGroups: groupAttributes(data.attributes),
      weaponGroups: groupItems(items.filter(item => item.weapon)),
      armorGroups: groupItems(items.filter(item => item.data.group === "Rüstung")),
      derivedValues: data.derived.filter(row => !["LE", "AE", "KE"].includes(row.key.toUpperCase())),
      canEdit: this.isEditable, canRoll: this.actor.isOwner,
      canRollPerception: this.actor.isOwner && Boolean(perceptionCheck(data)) };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".ucurifunke-character");
    const tablist = root.querySelector('[role="tablist"]');
    tablist.onkeydown = event => {
      const tabs = [...tablist.querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(event.target);
      const next = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
        ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (index < 0 || next === undefined) return;
      event.preventDefault();
      this.#selectTab(tabs[next].dataset.sheetTab, true);
      tabs[next].focus();
    };
    for (const panel of root.querySelectorAll("[data-searchable]")) {
      const input = panel.querySelector('input[type="search"]');
      const category = panel.querySelector("select");
      const key = panel.dataset.sheetPanel;
      const saved = this.#filters[key];
      input.value = saved?.query ?? "";
      if (category) category.value = saved?.category ?? "";
      const apply = () => {
        const filter = { query: input.value, category: category?.value ?? "" };
        this.#filters[key] = filter;
        filterSheet(panel, filter.query, filter.category);
      };
      input.oninput = apply;
      input.onkeydown = event => {
        if (event.key === "Enter") event.preventDefault();
      };
      if (category) category.onchange = apply;
      apply();
    }
    this.#selectTab(this.#activeTab);
  }

  #selectTab(name, resetScroll = false) {
    this.#activeTab = name;
    for (const tab of this.element.querySelectorAll("[data-sheet-tab]")) {
      const selected = tab.dataset.sheetTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of this.element.querySelectorAll("[data-sheet-panel]")) {
      panel.hidden = panel.dataset.sheetPanel !== name;
    }
    if (resetScroll) this.element.querySelector(".ucurifunke-sheet-body").scrollTop = 0;
  }

  static #openTab(_event, target) {
    this.#selectTab(target.dataset.sheetTab, true);
  }

  static async #roll(_event, target) {
    if (!this.actor.isOwner) return;
    const { kind, index, item, mode } = target.dataset;
    const data = this.actor.system;
    const skill = kind === "technique" ? data.skills[Number(index)] : null;
    const settings = skill ? techniqueSettings(this.actor, skill) : null;
    let check = kind === "weapon" ? weaponCheck(this.actor, this.actor.items.get(item), mode)
      : kind === "attribute" ? attributeCheck(data.attributes, Number(index))
      : kind === "skill" ? skillCheck(data.skills, Number(index))
      : kind === "perception" ? perceptionCheck(data)
      : skill ? techniqueCheck(this.actor, skill, mode, settings) : null;
    if (!check || !Number.isInteger(check.value)) return;
    target.disabled = true;
    try {
      const selection = skill ? getSelection(game, canvas) : null;
      const canBookTicks = selection?.token?.actor?.uuid === this.actor.uuid;
      const fields = skill ? techniqueFields(settings, canBookTicks)
        : kind === "perception" ? perceptionFields(perceptionAttributes(data.attributes), check.attributes) : "";
      const modifier = await prepareRoll(check, fields);
      if (!modifier || !this.actor.isOwner) return;
      let bookTicks = false;
      if (skill) {
        const updated = readTechniqueSettings(modifier.fields);
        bookTicks = canBookTicks && [true, 1, "1", "true", "on"].includes(modifier.fields.bookTicks) && updated.ticks > 0;
        if (bookTicks) assertSameSelection(selection, getSelection(game, canvas));
        check = techniqueCheck(this.actor, skill, mode, updated);
        if (Object.keys(updated).some(key => updated[key] !== settings[key])) {
          await this.actor.update({ ["flags.ucurifunke.techniqueSettings." + techniqueFlag(skill)]: updated });
        }
      } else if (kind === "perception") {
        check = perceptionCheck(this.actor.system, [0, 1, 2].map(i => modifier.fields["attribute" + i]));
        if (!check) throw new Error("Bitte drei gültige Attribute auswählen.");
      }
      await postRoll(this.actor, check, modifier);
      if (bookTicks) await addActionTicks(selection, check.ticks, { game, canvas });
    } catch (error) {
      ui.notifications.error(error.message);
    } finally {
      target.disabled = false;
    }
  }

  static async #saveCombatValues(_event, target) {
    if (!this.isEditable) return;
    const fields = target.closest("section");
    const reaction = fields.querySelector('[name="reaction"]').valueAsNumber;
    const impairment = fields.querySelector('[name="impairment"]').valueAsNumber;
    if (![reaction, impairment].every(value => Number.isSafeInteger(value) && value >= 0)) {
      ui.notifications.warn("BE und RE müssen nichtnegative Ganzzahlen sein.");
      return;
    }
    target.disabled = true;
    try {
      await this.actor.update({ "system.reaction": reaction, "system.impairment": impairment });
    } catch (error) {
      ui.notifications.error(error.message);
    } finally {
      target.disabled = false;
    }
  }
}
