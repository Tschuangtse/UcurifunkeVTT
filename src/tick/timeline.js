import { getLanguage, strings, t } from "./i18n.js";
import {
  addEvent,
  getCombatant,
  getCombatantAndEventsList,
  getCombatantInfo,
  getEventById,
  normalizeTicks,
  removeEvent,
  setNote,
  setTicks,
  toggleHideEvent,
  toggleWaiting,
  updateEvent
} from "./data.js";
import { editEvent } from "./editEvent.js";
import { canRollInitiative, rollInitiative } from "./initiative.js";
import { groupTimeline } from "./timelineView.js";
import { refreshTokenHighlights } from "./tokenHighlights.js";
import { advanceComplexAction, canAdvanceComplexAction, cancelComplexAction, canManageComplexAction, promptComplexAction } from "./complexAction.js";

const MODULE_ID = "ucurifunke";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function groupedTimeline() {
  const limit = Number(game.settings.get(MODULE_ID, "visibleTickGroups") ?? 0);
  return groupTimeline(getCombatantAndEventsList(), limit);
}

export class TimelineApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "timeline-app",
    classes: ["tick-combat-app"],
    position: {
      width: 500,
      height: 360,
      scale: 1
    },
    window: {
      icon: "fa-solid fa-stopwatch",
      resizable: true,
      minimizable: true
    },
    actions: {
      timelineHelp: this._onHelp,
      addEvent: this._onAddEvent,
      beginComplexAction: this._onBeginComplexAction,
      advanceComplexAction: this._onAdvanceComplexAction,
      cancelComplexAction: this._onCancelComplexAction,
      cycleScale: this._onCycleScale,
      toggleLanguage: this._onToggleLanguage,
      toggleLimit: this._onToggleLimit,
      startCombat: this._onStartCombat,
      endCombat: this._onEndCombat,
      editItem: this._onEditItem,
      rollInitiative: this._onRollInitiative,
      fastForward: this._onFastForward,
      deleteEvent: this._onDeleteEvent,
      toggleWait: this._onToggleWait,
      toggleHide: this._onToggleHide
    }
  };

  get title() {
    return t("timeline");
  }

  _getFrameButtons(options) {
    return [
      { action: "timelineHelp", icon: "fa-solid fa-question", label: t("helpTitle") },
      ...super._getFrameButtons(options)
    ];
  }

  async _renderFrameButtons(options) {
    await super._renderFrameButtons(options);
    const header = this.window.header;
    const help = header.querySelector('[data-action="timelineHelp"]');
    const controls = header.querySelector('[data-action="toggleControls"]');
    if (help && controls) controls.before(help);
  }

  static async _onHelp() {
    const keys = ["helpPing", game.user?.isGM ? "helpInitiativeGM" : "helpInitiativePlayer"];
    if (game.user?.isGM) keys.push("helpEdit", "helpTickCost");
    const content = "<ul>" + keys.map(key => `<li>${t(key)}</li>`).join("") + "</ul>";
    await foundry.applications.api.DialogV2.prompt({
      window: { title: t("helpTitle") },
      content,
      rejectClose: false,
      ok: { label: t("ok") }
    });
  }

  static PARTS = {
    main: {
      template: "systems/ucurifunke/templates/timeline.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const list = groupedTimeline();
    for (const group of list) {
      for (const item of group.items) {
        if (!item.isEvent) {
          const ticks = group.ticks;
          item.tickBand = ticks >= 20 ? "high" : ticks >= 10 ? "medium" : "low";
        }
        item.canRollInitiative = !item.isEvent && canRollInitiative(item.combatant);
        item.canManageComplexAction = !item.isEvent && canManageComplexAction(item.combatant);
        item.canAdvanceComplexAction = !item.isEvent && canAdvanceComplexAction(item.combatant);
      }
    }
    const scale = Number(game.settings.get(MODULE_ID, "scale") ?? 1);

    return {
      ...context,
      labels: strings(),
      language: getLanguage().toUpperCase(),
      list,
      isGM: Boolean(game.user?.isGM),
      scale,
      limited: Number(game.settings.get(MODULE_ID, "visibleTickGroups")) === 3,
      totalTicks: parseInteger(game.combat?.getFlag(MODULE_ID, "totalTicks"), 0),
      started: Boolean(game.combat?.started),
      hasCombat: Boolean(game.combat)
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    refreshTokenHighlights(!this.minimized);

    for (const input of this.element.querySelectorAll("input.tick-combat-ticks")) {
      input.addEventListener("focus", event => event.currentTarget.select());
      input.addEventListener("keydown", event => this._onTickKeydown(event));
    }

    this.fitToTimeline();
  }

  async _onClose(options) {
    await super._onClose(options);
    refreshTokenHighlights(false);
  }

  fitToTimeline() {
    // Later data refreshes must preserve a manually resized window.
    if (this._hasInitialSize) return;
    const groups = groupedTimeline().length;
    const desired = 40 + (groups * 190);
    const viewportLimit = Math.max(360, (globalThis.innerWidth ?? 1280) - 120);
    const width = Math.min(Math.max(desired, 360), viewportLimit);
    const scale = Number(game.settings.get(MODULE_ID, "scale") ?? 1);
    this._hasInitialSize = true;
    return this.setPosition({ width, height: 360, scale });
  }

  _prePosition(position) {
    super._prePosition(position);
    if (this.minimized) return;
    if (typeof position.width === "number") position.width = Math.max(360, position.width);
    if (typeof position.height === "number") position.height = Math.max(220, position.height);
  }

  async _onTickKeydown(event) {
    if (event.key !== "Enter" || !game.user?.isGM) return;
    event.preventDefault();
    const input = event.currentTarget;

    const delta = parseInteger(input.value, 0);
    if (delta === 0) return;

    const combatant = getCombatant(input.dataset.id);
    if (!combatant) return;
    if (getCombatantInfo(combatant).complexAction) return;

    const current = getCombatantInfo(combatant).ticks;
    await setTicks(combatant, current + delta);
    input.value = "0";
    await normalizeTicks();
  }

  static async _onAddEvent() {
    if (!game.user?.isGM) return;
    if (!game.combat) {
      ui.notifications?.warn(t("needEncounter"));
      return;
    }

    const eventData = {
      name: t("newEvent"),
      isEvent: true,
      ticks: 100,
      ffwd: 1,
      repeating: true,
      notes: ""
    };

    await editEvent(eventData, async data => {
      await addEvent(data);
      await normalizeTicks();
    });

    this.render();
  }

  static async _onRollInitiative(_event, target) {
    const combatant = getCombatant(target.dataset.id);
    if (!canRollInitiative(combatant)) return;
    await rollInitiative(combatant);
    await this.render();
  }

  static async _onBeginComplexAction() {
    await promptComplexAction();
    await this.render();
  }

  static async _onAdvanceComplexAction(_event, target) {
    await advanceComplexAction(getCombatant(target.dataset.id));
    await this.render();
  }

  static async _onCancelComplexAction(_event, target) {
    if (await cancelComplexAction(getCombatant(target.dataset.id))) await this.render();
  }

  static async _onToggleLanguage() {
    await game.settings.set(MODULE_ID, "language", getLanguage() === "en" ? "de" : "en");
  }

  static async _onCycleScale() {
    const current = Number(game.settings.get(MODULE_ID, "scale") ?? 1);
    const values = [0.5, 0.75, 1, 1.25, 1.5];
    const currentIndex = values.findIndex(value => Math.abs(value - current) < 0.01);
    const next = values[(currentIndex + 1 + values.length) % values.length];
    await game.settings.set(MODULE_ID, "scale", next);
    // Settings callbacks need not be awaited by Foundry.
    await this.render({ parts: ["main"] });
  }

  static async _onToggleLimit() {
    const current = Number(game.settings.get(MODULE_ID, "visibleTickGroups"));
    await game.settings.set(MODULE_ID, "visibleTickGroups", current === 3 ? 0 : 3);
  }

  static async _onStartCombat() {
    if (!game.user?.isGM || !game.combat || game.combat.started) return;
    await game.combat.setFlag(MODULE_ID, "totalTicks", 0);
    if (!game.combat.started) await game.combat.startCombat();
    await normalizeTicks();
    await this.render();
  }

  static async _onEndCombat() {
    if (!game.user?.isGM || !game.combat?.started) return;
    await game.combat.endCombat();
    this.render();
  }

  static async _onEditItem(event, target) {
    const id = target.dataset.id;
    if (!id) return;

    const combatant = getCombatant(id);

    if (event.shiftKey && combatant?.token) {
      const token = combatant.token;
      const activeCanvas = globalThis.canvas;
      const center = token.object?.center ?? {
        x: token.x + ((token.width ?? 1) * (activeCanvas?.grid?.size ?? 100) / 2),
        y: token.y + ((token.height ?? 1) * (activeCanvas?.grid?.size ?? 100) / 2)
      };
      if (activeCanvas?.ready) await activeCanvas.ping(center, { duration: 3000 });
      return;
    }

    if (!game.user?.isGM) return;

    if (combatant) {
      const current = getCombatantInfo(combatant);
      await editEvent(current, async data => {
        await setTicks(combatant, data.ticks);
        await setNote(combatant, data.notes);
        await combatant.update({ name: data.name });
        if (combatant.token) await combatant.token.update({ name: data.name });
        await normalizeTicks();
      });
      this.render();
      return;
    }

    const timelineEvent = getEventById(id);
    if (!timelineEvent) return;

    await editEvent(timelineEvent, async data => {
      await updateEvent(data);
      await normalizeTicks();
    });
    this.render();
  }

  static async _onFastForward(_event, target) {
    if (!game.user?.isGM) return;
    const timelineEvent = getEventById(target.dataset.id);
    if (!timelineEvent) return;

    if (parseInteger(timelineEvent.ffwd, -1) > 0) {
      await updateEvent({
        ...timelineEvent,
        ticks: parseInteger(timelineEvent.ticks, 0) + parseInteger(timelineEvent.ffwd, 0)
      });
    } else {
      await removeEvent(timelineEvent);
    }

    await normalizeTicks();
    this.render();
  }

  static async _onDeleteEvent(_event, target) {
    if (!game.user?.isGM) return;
    const timelineEvent = getEventById(target.dataset.id);
    if (!timelineEvent) return;
    await removeEvent(timelineEvent);
    await normalizeTicks();
    this.render();
  }

  static async _onToggleWait(_event, target) {
    const combatant = getCombatant(target.dataset.id);
    if (!combatant) return;

    const info = getCombatantInfo(combatant);
    if (!info.canWait) return;

    await toggleWaiting(combatant);
    if (game.user?.isGM) await normalizeTicks();
    this.render();
  }

  static async _onToggleHide(_event, target) {
    if (!game.user?.isGM) return;
    const timelineEvent = getEventById(target.dataset.id);
    if (!timelineEvent) return;
    await toggleHideEvent(timelineEvent);
    this.render();
  }
}
