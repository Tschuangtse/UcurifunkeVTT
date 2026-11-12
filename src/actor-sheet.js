import { parseCharacter } from "./import-data.js";
import { postRoll, prepareRoll, weaponCheck } from "./checks.js";
import { filterSheet, groupItems, groupSkills } from "./sheet-view.js";

const { api, sheets } = foundry.applications;
const path = "systems/ucurifunke/templates/actor.hbs";

export async function importPedipalpus() {
  if (!game.user.can("ACTOR_CREATE")) return;
  const content = document.createElement("div");
  content.innerHTML = '<label>Pedipalpus-Charakterdatei <input type="file" name="character" accept=".json,application/json" required></label>';
  try {
    const character = await api.DialogV2.prompt({
      window: { title: "Pedipalpus-Charakter importieren" },
      content, modal: true, rejectClose: false,
      ok: {
        label: "Neuen Charakter erstellen",
        callback: async (_event, button) => {
          const file = button.form.elements.namedItem("character").files[0];
          if (!file) throw new Error("Bitte eine JSON-Datei auswählen.");
          return parseCharacter(await file.text());
        }
      }
    });
    if (!character) return;
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
    const skillGroups = groupSkills(data.skills);
    const combatGroups = skillGroups.filter(group => ["Nahkampf", "Fernkampf"].includes(group.name));
    return { ...context, data, sheetId: this.id, actorName: this.actor.name, actorImage: this.actor.img,
      skillGroups: skillGroups.filter(group => !combatGroups.includes(group)), combatGroups,
      equipmentGroups: groupItems(items), weaponGroups: groupItems(items.filter(item => item.weapon)),
      canEdit: this.isEditable, canRoll: this.actor.isOwner };
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
    const check = kind === "weapon" ? weaponCheck(this.actor, this.actor.items.get(item), mode)
      : kind === "attribute" ? { ...data.attributes[index], kind }
      : data.skills[index]?.rollable ? { ...data.skills[index], kind } : null;
    if (!check || !Number.isInteger(check.value)) return;
    target.disabled = true;
    try {
      const modifier = await prepareRoll(check);
      if (modifier !== null && this.actor.isOwner) await postRoll(this.actor, check, modifier);
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
