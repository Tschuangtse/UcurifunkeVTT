import { parseCharacter } from "./import-data.js";
import { convertNpc, isNpcFile, npcRetinue } from "./npc-import.js";
import { dodgeCheck, dodgeValue, postRoll, prepareRoll, weaponCheck } from "./checks.js";
import { escapeHtml } from "./check-card.js";
import { effectiveTicks, tickOverridePatch, weaponTickFields } from "./weapon-ticks.js";
import { bindFocus, combatFocus } from "./combat-focus.js";
import { chooseCharacterFile, updatePedipalpusActor } from "./import-preview.js";
import { applyConditionEffects, conditionEffects, conditionRows, conditionSummary, SUPPRESSIONS } from "./conditions.js";
import { linkAttack, selectedAttackTarget } from "./combat-workflow.js";
import { planRetinue, retinueSource, syncRetinue } from "./retinue.js";
import { addActionTicks, assertSameSelection, getSelection } from "./actions/combat.js";
import { readTechniqueSettings, techniqueCheck, techniqueFlag, techniqueSettings } from "./technique-check.js";
import { attributeCheck, filterSheet, groupAttributes, groupItems, partitionSkills, perceptionAttributes,
  perceptionCheck, skillCheck } from "./sheet-view.js";

const { api, sheets } = foundry.applications;
const path = "systems/ucurifunke/templates/actor.hbs";
const focusTemplate = "systems/ucurifunke/templates/combat-focus.hbs";

function perceptionFields(attributes, defaults) {
  return defaults.map((attribute, index) => {
    const options = attributes.map(row => {
      const key = row.key.toUpperCase();
      return `<option value="${escapeHtml(key)}"${key === attribute?.key?.toUpperCase() ? " selected" : ""}>${escapeHtml(row.name)}</option>`;
    }).join("");
    return `<div class="form-group"><label for="ucurifunke-attribute-${index}">Attribut ${index + 1}</label>
      <select id="ucurifunke-attribute-${index}" name="attribute${index}" required>
      ${attribute?.key ? "" : '<option value="" selected>Attribut wählen</option>'}${options}</select></div>`;
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
  try {
    const file = await chooseCharacterFile("Neuen Charakter erstellen");
    if (!file) return;
    const json = await file.text();
    const source = JSON.parse(json.replace(/^\uFEFF/, ""));
    const npc = isNpcFile(source);
    const character = npc ? convertNpc(source) : parseCharacter(json);
    const actor = await foundry.documents.Actor.implementation.create(character);
    const retinue = retinueSource(npc ? npcRetinue(source) : source);
    if (actor && Object.values(retinue).some(rows => rows.length)) {
      const pending = await syncRetinue(actor, retinue);
      if (pending.length) ui.notifications.warn("Gefolge zur Übernahme vorgemerkt: " + pending.join(", "));
    }
    await actor?.sheet.render({ force: true });
  } catch (error) {
    ui.notifications.error(error.message);
  }
}

export class CharacterSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  #activeTab = "overview";
  #filters = {};
  #selectedCondition = "";

  static DEFAULT_OPTIONS = {
    classes: ["ucurifunke-sheet"], position: { width: 710, height: 720 },
    actions: { rollCheck: CharacterSheet.#roll, saveCombatValues: CharacterSheet.#saveCombatValues,
      openSheetTab: CharacterSheet.#openTab, updatePedipalpus: CharacterSheet.#updatePedipalpus,
      showCondition: CharacterSheet.#showCondition, cycleCondition: CharacterSheet.#cycleCondition,
      openCompanion: CharacterSheet.#openCompanion, importRetinue: CharacterSheet.#importRetinue,
      editWeaponTicks: CharacterSheet.#editWeaponTicks }
  };

  static PARTS = { character: { template: path, scrollable: [".ucurifunke-sheet-body"] } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await foundry.applications.handlebars.loadTemplates([focusTemplate]);
    const data = this.actor.system;
    const companionDetails = data.companionDetails.filter(row => row.name !== "Beschreibung")
      .map(row => ({ name: row.name, value: row.value, fullWidth: row.name === "Besondere Eigenschaften" }));
    const companion = this.actor.type === "retinue";
    const retinue = companion ? [] : (globalThis.game?.actors?.filter(actor => actor.type === "retinue" && actor.visible
      && actor.getFlag("ucurifunke", "retinueOwner") === this.actor.id)
      .map(actor => ({ id: actor.id, name: actor.name, kind: actor.system.companionKind })) ?? []);
    const pending = !companion && this.actor.getFlag?.("ucurifunke", "retinuePending");
    const pendingPlan = pending && planRetinue(this.actor, pending);
    const effects = conditionEffects(data);
    const conditions = conditionRows(data).map(row => ({ ...row,
      suppressionLabel: !row.suppression && row.automatic ? "1 (Vorteil)" : SUPPRESSIONS[row.suppression]
    }));
    const items = this.actor.items.map(item => {
      const weapon = item.type === "weapon";
      return {
        id: item.id, name: item.name, data: item.system, weapon,
        attack: weapon && Number.isInteger(item.system.attack),
        parry: weapon && Number.isInteger(item.system.parry),
        attackMode: item.system.group === "Fernkampf" ? "FK" : "AT",
        tickFields: weapon ? weaponTickFields(item).map(field => ({
          ...field, ticks: effectiveTicks(this.actor, field.action, item.id, field.source)
        })) : []
      };
    });
    return { ...context, data, sheetId: this.id, actorName: this.actor.name, actorImage: this.actor.img,
      ...partitionSkills(data.skills, companion, data.npcGenerator), focus: combatFocus(this.actor),
      focusMin: data.npcGenerator ? -4 : -2, focusMax: data.npcGenerator ? 4 : 2,
      dodge: dodgeValue(this.actor), canDodge: this.actor.isOwner && dodgeValue(this.actor) != null,
      focusTemplate,
      attributeGroups: groupAttributes(data.attributes).map(group => ({ ...group, rows: group.rows.map(row => ({
        ...row, value: row.value - (effects.modifiers[row.key.toUpperCase()] ?? []).reduce((sum, modifier) => sum + modifier.value, 0)
      })) })),
      weaponGroups: groupItems(items.filter(item => item.weapon)),
      armorGroups: groupItems(items.filter(item => item.data.group === "Rüstung")),
      derivedValues: data.derived.filter(row => !["LE", "AE", "KE"].includes(row.key.toUpperCase()))
        .map(row => row.key.toUpperCase() === "GS" ? { name: row.name, key: row.key, value: effects.effectiveSpeed } : row),
      conditionSummary: conditionSummary(effects), simpleConditions: conditions.filter(row => !row.staged),
      stagedConditions: conditions.filter(row => row.staged),
      conditionRule: conditions.find(row => row.key === this.#selectedCondition),
      companion, npcGenerator: data.npcGenerator, companionDetails, retinue, canImportRetinue: Boolean(pending && globalThis.game?.user?.isGM),
      pendingRetinue: pendingPlan ? pendingPlan.entries.length + pendingPlan.removed.length : 0,
      canEdit: this.isEditable, canRoll: this.actor.isOwner, canImport: this.actor.isOwner && !this.actor.isToken && !companion,
      canRollPerception: this.actor.isOwner && Boolean(perceptionCheck(data)) };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const focus = this.element.querySelector(".ucurifunke-focus");
    if (focus) {
      bindFocus(focus);
      const slider = focus.querySelector('[name="combatFocus"]');
      slider.addEventListener("change", async () => {
        if (!this.isEditable || !this.actor.isOwner) return;
        try { await this.actor.update({ "system.combatFocus": Number(slider.value) }); }
        catch (error) {
          ui.notifications.error(error.message);
          await this.render();
        }
      });
    }
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
      const category = panel.querySelector(".ucurifunke-filter select");
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
    const conditions = root.querySelector('[data-sheet-panel="conditions"]');
    conditions.onchange = async event => {
      const { conditionField } = event.target.dataset;
      if (!conditionField) return;
      const value = conditionField === "level" ? event.target.valueAsNumber : event.target.checked;
      await this.#updateCondition(event.target, conditionField, value);
    };
    this.#selectTab(this.#activeTab);
  }

  static async #updatePedipalpus() {
    try { await updatePedipalpusActor(this.actor); }
    catch (error) { ui.notifications.error(error.message); }
  }

  static async #editWeaponTicks(_event, target) {
    if (!this.isEditable || !this.actor.isOwner) return;
    const item = this.actor.items.get(target.dataset.item);
    if (item?.type !== "weapon") return;
    const fields = weaponTickFields(item);
    const content = document.createElement("div");
    for (const { action, label, source } of fields) {
      const row = document.createElement("div");
      row.className = "uqca-tick-field";
      row.innerHTML = `<label>${label} <input type="number" name="${action}" min="0" max="32" step="1" required
        value="${effectiveTicks(this.actor, action, item.id, source)}"></label>
        <button type="button" data-reset="${action}" data-source="${source}">Zurücksetzen</button>`;
      content.append(row);
    }
    try {
      const result = await api.DialogV2.input({
        window: { title: "Tickkosten – " + item.name }, content, modal: true, rejectClose: false,
        classes: ["uqca-cost-dialog"], ok: { label: "Speichern" },
        render: (_event, dialog) => {
          for (const reset of dialog.element.querySelectorAll("[data-reset]")) {
            reset.addEventListener("click", () => {
              reset.form.elements.namedItem(reset.dataset.reset).value = reset.dataset.source;
            });
          }
        }
      });
      if (!result || !this.actor.isOwner || !this.actor.items.get(item.id)) return;
      const patch = {};
      for (const { action, source } of fields) {
        const ticks = Number(result[action]);
        if (result[action] === "" || !Number.isInteger(ticks) || ticks < 0 || ticks > 32) throw new Error("Bitte ganze Tickkosten von 0 bis 32 eingeben.");
        Object.assign(patch, tickOverridePatch(this.actor, action, item.id, ticks, source));
      }
      if (Object.keys(patch).length) await this.actor.update(patch);
    } catch (error) { ui.notifications.error(error.message); }
  }

  static #openCompanion(_event, target) {
    const actor = game.actors.get(target.dataset.companionId);
    if (actor?.visible && actor.getFlag("ucurifunke", "retinueOwner") === this.actor.id) actor.sheet.render({ force: true });
  }

  static async #importRetinue(_event, target) {
    if (!game.user.isGM) return;
    const source = this.actor.getFlag("ucurifunke", "retinuePending");
    if (!source) return;
    target.disabled = true;
    try {
      const { entries, removed } = planRetinue(this.actor, source);
      const names = [...entries.map(({ data }) => escapeHtml(data.name)),
        ...removed.map(actor => escapeHtml(actor.name) + " (Akteur und Token entfernen)")];
      const confirmed = await api.DialogV2.confirm({ window: { title: "Gefolge übernehmen" },
        content: `<p>${names.join(", ")}</p>`, modal: true, rejectClose: false });
      if (!confirmed) return;
      if (this.actor.getFlag("ucurifunke", "retinuePending") !== source) throw new Error("Die Gefolgedaten wurden zwischenzeitlich geändert.");
      const pending = await syncRetinue(this.actor, source);
      if (pending.length) ui.notifications.warn("Weiterhin vorgemerkt: " + pending.join(", "));
      else ui.notifications.info("Gefolge übernommen.");
    } catch (error) { ui.notifications.error(error.message); }
    finally { target.disabled = false; }
  }

  static #showCondition(_event, target) {
    const row = conditionRows(this.actor.system).find(entry => entry.key === target.closest("tr").dataset.condition);
    if (!row) return;
    this.#selectedCondition = row.key;
    const rule = this.element.querySelector("[data-condition-rule]");
    rule.querySelector("h4").textContent = row.name;
    rule.querySelector("p").textContent = row.description || "Für diesen Zustand ist keine Regelbeschreibung hinterlegt.";
  }

  static async #cycleCondition(_event, target) {
    const row = conditionRows(this.actor.system).find(entry => entry.key === target.closest("tr").dataset.condition);
    if (row) await this.#updateCondition(target, "suppression", (row.suppression + 1) % SUPPRESSIONS.length);
  }

  async #updateCondition(target, field, value) {
    if (!this.isEditable || !this.actor.isOwner) return;
    const rows = conditionRows(this.actor.system);
    const row = rows.find(entry => entry.key === target.closest("tr").dataset.condition);
    if (!row) return;
    if (field === "level" && (!Number.isInteger(value) || value < 0 || value > row.max)) {
      target.value = row.level;
      ui.notifications.warn("Die Stufe muss zwischen 0 und " + row.max + " liegen.");
      return;
    }
    row[field] = value;
    target.disabled = true;
    try {
      await this.actor.update({ "system.conditions": rows.map(({ name, staged, active, suppressed, level, suppression }) =>
        ({ name, staged, active, suppressed, level, suppression })) });
    } catch (error) {
      ui.notifications.error(error.message);
      await this.render();
    } finally {
      target.disabled = false;
    }
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
    const companionAbility = kind === "companionAbility" ? data.skills[Number(index)] : null;
    const settings = skill ? techniqueSettings(this.actor, skill) : null;
    const companionPerception = kind === "perception" && this.actor.type === "retinue";
    let check = kind === "weapon" ? weaponCheck(this.actor, this.actor.items.get(item), mode)
      : kind === "dodge" ? dodgeCheck(this.actor)
      : kind === "attribute" ? attributeCheck(data.attributes, Number(index))
      : kind === "skill" ? skillCheck(data.skills, Number(index))
      : kind === "perception" ? perceptionCheck(data)
      : companionAbility && (this.actor.type === "retinue" || data.npcGenerator) && companionAbility.rollable
        ? { ...companionAbility, kind: "skill" }
      : skill ? techniqueCheck(this.actor, skill, mode, settings) : null;
    if (check && companionPerception) check = { kind: "attribute", name: check.name, value: check.value };
    if (!check || !Number.isInteger(check.value)) return;
    target.disabled = true;
    try {
      const attackTarget = selectedAttackTarget(this.actor, check);
      const weaponDamage = kind === "weapon" ? this.actor.items.get(item)?.system.damage : "";
      if (kind !== "perception" || companionPerception) applyConditionEffects(this.actor, check);
      const weaponAttack = kind === "weapon";
      const selection = skill || weaponAttack ? getSelection(game, canvas) : null;
      const canBookTicks = selection?.token?.actor?.uuid === this.actor.uuid;
      const abilityFlag = companionAbility && techniqueFlag(companionAbility);
      const remembered = abilityFlag && this.actor.getFlag("ucurifunke", "companionAbilityAttributes")?.[abilityFlag];
      const primary = perceptionAttributes(data.attributes);
      const abilityDefaults = remembered?.map(key => primary.find(row => row.key === key)) ?? check.attributes;
      const fields = skill ? techniqueFields(settings, canBookTicks)
        : kind === "perception" && !companionPerception ? perceptionFields(primary, check.attributes)
        : companionAbility ? perceptionFields(primary, [0, 1, 2].map(i => abilityDefaults[i]))
        : weaponAttack && canBookTicks && check.ticks > 0 && check.ticks <= 32
          ? `<label><input type="checkbox" name="bookTicks"> ${check.ticks} Ticks im laufenden Kampf buchen</label>` : "";
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
      } else if (kind === "perception" && !companionPerception) {
        check = perceptionCheck(this.actor.system, [0, 1, 2].map(i => modifier.fields["attribute" + i]));
        if (!check) throw new Error("Bitte drei gültige Attribute auswählen.");
      } else if (companionAbility) {
        const keys = [0, 1, 2].map(i => modifier.fields["attribute" + i]);
        const attributes = keys.map(key => primary.find(row => row.key.toUpperCase() === key));
        if (!attributes.every(Boolean)) throw new Error("Bitte drei gültige Attribute auswählen.");
        if (data.npcGenerator && new Set(keys).size < 2) throw new Error("Drei gleiche Attribute sind bei NSC-Proben nicht erlaubt.");
        check = { ...check, attributes };
        if (keys.some((key, index) => key !== abilityDefaults[index]?.key)) {
          await this.actor.update({ ["flags.ucurifunke.companionAbilityAttributes." + abilityFlag]: keys });
        }
      } else if (weaponAttack && canBookTicks && fields) {
        bookTicks = [true, 1, "1", "true", "on"].includes(modifier.fields.bookTicks);
      }
      check = applyConditionEffects(this.actor, check);
      if (bookTicks) await addActionTicks(selection, check.ticks, { game, canvas });
      if (check.kind === "combat") check = linkAttack(this.actor, check, attackTarget, weaponDamage, bookTicks ? check.ticks : attackTarget ? 0 : undefined);
      await postRoll(this.actor, check, modifier);
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
    const dodge = fields.querySelector('[name="dodgeOverride"]');
    if (![reaction, impairment].every(value => Number.isSafeInteger(value) && value >= 0)) {
      ui.notifications.warn("BE und RE müssen nichtnegative Ganzzahlen sein.");
      return;
    }
    target.disabled = true;
    try {
      if (dodge.value !== "" && !Number.isSafeInteger(dodge.valueAsNumber)) throw new Error("Der Ausweichwert muss eine Ganzzahl sein.");
      const previous = dodgeValue(this.actor);
      const update = { "system.reaction": reaction, "system.impairment": impairment };
      if (dodge.value === "" || dodge.valueAsNumber !== previous) update["system.dodgeOverride"] = dodge.value === "" ? null : dodge.valueAsNumber;
      await this.actor.update(update);
    } catch (error) {
      ui.notifications.error(error.message);
    } finally {
      target.disabled = false;
    }
  }
}

export class CompanionSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = { classes: ["ucurifunke-companion-sheet"] };
}
