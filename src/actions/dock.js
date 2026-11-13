import { ACTIONS, CATEGORIES, parseCost } from "./actions.js";
import { MODULE_ID, SETTINGS_SCOPE, OWNERSHIP_ERROR, getSelection, addActionTicks, assertSameSelection } from "./combat.js";
import { requestCost, saveTickOverride } from "./cost-dialog.js";
import { requestFocus } from "../combat-focus.js";
import { dodgeCheck, postRoll, prepareRoll, weaponCheck } from "../checks.js";
import { applyConditionEffects } from "../conditions.js";
import { linkAttack, selectedAttackTarget } from "../combat-workflow.js";

export class ActionDock {
  constructor({ getGame = () => game, getCanvas = () => globalThis.canvas, notify = message => ui.notifications.warn(message),
    costPrompt = requestCost, focusPrompt = requestFocus, applyTicks = addActionTicks } = {}) {
    Object.assign(this, { getGame, getCanvas, notify, costPrompt, focusPrompt, applyTicks });
    this.expanded = null;
    this.busy = false;
  }

  refresh() {
    const game = this.getGame();
    if (!game.user || !game.settings.get(SETTINGS_SCOPE, "enabled")) {
      this.root?.remove();
      this.root = null;
      this.expanded = null;
      return;
    }
    if (!this.root?.isConnected) this.mount();
    const bottom = Number(game.settings.get(SETTINGS_SCOPE, "bottomOffset"));
    this.root.style.setProperty("--uqca-bottom", `${Number.isFinite(bottom) ? Math.max(0, bottom) : 80}px`);
    this.update();
  }

  mount() {
    this.root = document.createElement("section");
    this.root.id = MODULE_ID;
    this.root.setAttribute("aria-label", "Ucurifunke Kampfhandlungen");
    this.root.innerHTML = `
      <section class="uqca-panel" id="uqca-panel" hidden>
        <header><strong class="uqca-title"></strong><button type="button" data-collapse title="Einklappen" aria-label="Handlungsliste einklappen"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></header>
        <p class="uqca-status" role="status" aria-live="polite"></p>
        <div class="uqca-actions"></div>
      </section>
      <nav class="uqca-tabs" aria-label="Handlungskategorien"></nav>`;
    const tabs = this.root.querySelector(".uqca-tabs");
    for (const category of CATEGORIES) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = category.id;
      button.setAttribute("aria-controls", "uqca-panel");
      button.title = category.title;
      const icon = document.createElement("i");
      icon.className = category.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = category.label;
      button.append(icon, label);
      tabs.append(button);
    }
    this.root.addEventListener("click", event => {
      const target = event.target.closest("button");
      if (!target || !this.root.contains(target)) return;
      if (target.dataset.category) this.toggle(target.dataset.category);
      else if (target.hasAttribute("data-collapse")) this.collapse();
      else if (target.dataset.actionId) void this.execute(target.dataset.actionId);
    });
    this.root.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.expanded) {
        event.preventDefault();
        event.stopPropagation();
        this.collapse();
      }
    });
    document.body.append(this.root);
  }

  toggle(id) {
    this.expanded = this.expanded === id ? null : id;
    this.renderActions();
    this.update();
  }

  collapse() {
    const previous = this.expanded;
    this.expanded = null;
    this.update();
    this.root?.querySelector(`[data-category="${previous}"]`)?.focus();
  }

  renderActions() {
    const category = CATEGORIES.find(item => item.id === this.expanded);
    if (!category) return;
    this.root.querySelector(".uqca-title").textContent = category.title;
    const list = this.root.querySelector(".uqca-actions");
    list.replaceChildren();
    for (const action of category.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.actionId = action.id;
      button.textContent = `${action.name} (${action.ticks === null ? "variabel" : `${action.ticks} ${action.ticks === 1 ? "Tick" : "Ticks"}`})`;
      button.title = action.hint ?? button.textContent;
      list.append(button);
    }
  }

  update() {
    if (!this.root) return;
    // Keep the open controls clickable above sheets and the timeline. Yield to action dialogs.
    this.root.style.zIndex = this.expanded && !this.busy ? String(Math.max(60,
      ...Array.from(document.querySelectorAll(".application:not(.dialog)"),
        element => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0)) + 1) : "";
    const selection = getSelection(this.getGame(), this.getCanvas());
    this.root.querySelector(".uqca-panel").hidden = !this.expanded;
    this.root.querySelector(".uqca-status").textContent = this.busy ? "Handlung wird bearbeitet …"
      : selection.error ?? `Für: ${selection.combatant.name ?? selection.token.name ?? "Token"}`;
    for (const button of this.root.querySelectorAll("[data-category]")) {
      button.setAttribute("aria-expanded", String(button.dataset.category === this.expanded));
    }
    const blocked = selection.error && selection.error !== OWNERSHIP_ERROR;
    for (const button of this.root.querySelectorAll("[data-action-id]")) button.disabled = this.busy || Boolean(blocked);
    this.root.setAttribute("aria-busy", String(this.busy));
  }

  async execute(id) {
    const action = ACTIONS.get(id);
    if (this.busy || !action) return;
    const selection = getSelection(this.getGame(), this.getCanvas());
    if (selection.error) { this.notify(selection.error); return; }
    this.busy = true;
    this.update();
    try {
      const weaponAction = ["melee", "opportunity", "ranged", "parry", "parry-maneuver"].includes(id);
      const actor = selection.combatant.actor;
      if (id === "stance") {
        if (!actor?.isOwner) throw new Error(OWNERSHIP_ERROR);
        const focus = await this.focusPrompt(actor, selection.token.name);
        if (focus === null) return;
        assertSameSelection(selection, getSelection(this.getGame(), this.getCanvas()));
        const character = actor.isToken ? this.getGame().actors.get(actor.id) ?? actor : actor;
        if (!character.isOwner) throw new Error(OWNERSHIP_ERROR);
        await this.applyTicks(selection, action.ticks, { game: this.getGame(), canvas: this.getCanvas() });
        await character.update({ "system.combatFocus": focus });
        if (character !== actor) await actor.update({ "system.combatFocus": focus });
        this.collapse();
        return;
      }
      const cost = action.ticks === null || ((weaponAction || id === "reload") && actor?.items?.some(item => item.type === "weapon"))
        ? await this.costPrompt(action, selection) : action.ticks;
      if (cost === null || cost === undefined) return;
      const mode = id === "ranged" ? "FK" : id.startsWith("parry") ? "PA" : "AT";
      const weapon = weaponAction && cost.weaponId ? actor.items.get(cost.weaponId) : null;
      const check = id === "dodge" && actor ? dodgeCheck(actor) : weapon ? weaponCheck(actor, weapon, mode) : null;
      if (id === "dodge" && !check) throw new Error("Für diesen Akteur ist kein Ausweichwert hinterlegt.");
      const target = check && selectedAttackTarget(actor, check);
      if (check) applyConditionEffects(actor, check);
      const modifiers = check ? await prepareRoll(check) : null;
      if (check && modifiers === null) return;
      const adjusted = check && applyConditionEffects(actor, check);
      const ticks = parseCost(cost.ticks ?? cost);
      await this.applyTicks(selection, ticks, { game: this.getGame(), canvas: this.getCanvas() });
      await saveTickOverride(actor, id, cost.weaponId, ticks, cost.importedTicks);
      if (adjusted) await postRoll(actor, linkAttack(actor, adjusted, target, weapon?.system.damage, ticks), modifiers);
      this.collapse();
    } catch (error) {
      console.error(`${MODULE_ID} | Handlung fehlgeschlagen`, error);
      this.notify(error.message ?? "Die Tickkosten konnten nicht hinzugefügt werden.");
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
}
