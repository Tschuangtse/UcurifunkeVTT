import { t } from "./i18n.js";
import { clearEvents, getCombatantAndEventsList, isNormalizationAuthority, normalizeTicks } from "./data.js";
import { TimelineApp } from "./timeline.js";
import { getTimelineApp, setTimelineApp } from "./state.js";
import { refreshTokenHighlight, refreshTokenHighlights } from "./tokenHighlights.js";
import { getEncounterChoices, openTimeline, updateTimelineScale } from "./timelineControls.js";

const MODULE_ID = "ucurifunke";
const MODULE_TITLE = "Tick Combat";

function localizeActionMessage(message, element) {
  if (message?.isContentVisible === false) return;
  const data = message?.getFlag(MODULE_ID, "actionOutcome");
  if (!data || !["actionFinished", "actionCancelled"].includes(data.outcome)) return;
  const content = element.querySelector(".message-content");
  if (content) content.textContent = t(data.outcome, data);
}

function refreshLanguage() {
  const labels = {
    language: { name: t("language"), hint: t("languageHint"), choices: { en: t("english"), de: t("german") } },
    scale: { name: t("scale"), hint: t("scaleHint") },
    visibleTickGroups: { name: t("groups"), hint: t("groupsHint"), choices: { 0: t("all"), 3: t("nextThreePositions") } }
  };
  for (const [key, values] of Object.entries(labels)) {
    const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
    if (setting) Object.assign(setting, values);
  }
  const settingsSheet = game.settings.sheet;
  if (settingsSheet?.rendered) settingsSheet.render();
  ui.combat?.render();
  const chat = ui.chat?.element;
  for (const element of chat?.querySelectorAll("[data-message-id]") ?? []) {
    localizeActionMessage(game.messages.get(element.dataset.messageId), element);
  }
  const timeline = getTimelineApp();
  if (timeline?.rendered) timeline.render({ window: { title: t("timeline") } });
}

async function refreshTimeline({ open = false } = {}) {
  refreshTokenHighlights();
  const app = getTimelineApp();
  if (!app) return;

  const hasItems = getCombatantAndEventsList().length > 0;
  if (!hasItems) {
    if (app.rendered) await app.close();
    return;
  }

  if (open || app.rendered) {
    await app.render({ force: open || !app.rendered });
    app.fitToTimeline?.();
  }
}

function replaceCombatTracker(_app, element) {
  if (!(element instanceof HTMLElement)) return;
  const container = _app.isPopout
    ? element.querySelector(".window-content") ?? element : element;
  container.classList.add("tick-combat-replacement");
  container.querySelector(":scope > .tick-combat-sidebar")?.remove();
  const panel = document.createElement("section");
  panel.className = "tick-combat-sidebar";

  const explanation = document.createElement("p");
  explanation.textContent = t("trackerIntro");
  panel.append(explanation);

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.tickCombatLauncher = "true";
  button.classList.add("tick-combat-launcher");
  button.innerHTML = '<i class="fa-solid fa-stopwatch"></i><span></span>';
  button.querySelector("span").textContent = t("openTimeline");
  button.title = t("openTimelineTip");
  button.addEventListener("click", async () => {
    const timeline = getTimelineApp();
    if (!timeline) return;
    await openTimeline(timeline);
  });

  panel.append(button);

  if (game.user?.isGM) {
    const encounterLabel = document.createElement("label");
    encounterLabel.className = "tick-combat-encounter-select";
    const caption = document.createElement("span");
    caption.textContent = t("selectEncounter");
    const encounters = document.createElement("select");
    encounters.ariaLabel = t("selectEncounter");
    encounters.title = t("selectEncounterTip");
    const empty = document.createElement("option");
    empty.textContent = t("noEncounter");
    empty.value = "";
    empty.disabled = true;
    empty.selected = !game.combat;
    encounters.append(empty);
    for (const combat of getEncounterChoices(game.combats ?? [])) {
      const option = document.createElement("option");
      option.value = combat.id;
      option.textContent = combat.label;
      option.selected = combat.id === game.combat?.id;
      encounters.append(option);
    }
    encounters.addEventListener("change", async () => {
      const combat = game.combats.get(encounters.value);
      if (!combat || !game.user?.isGM) return;
      await combat.activate();
      await refreshTimeline({ open: true });
    });
    encounterLabel.append(caption, encounters);
    // With only one encounter there is nothing to switch.
    if ((game.combats?.size ?? 0) > 1) panel.append(encounterLabel);
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = t("createEncounter");
    create.addEventListener("click", async () => {
      if (!game.user?.isGM) return;
      await foundry.documents.Combat.implementation.create({
        scene: globalThis.canvas?.scene?.id ?? null, active: true
      });
      await refreshTimeline({ open: true });
    });
    panel.append(create);
  }
  container.append(panel);
}

Hooks.once("init", () => {
  console.info(`${MODULE_ID} | Initializing Foundry V14 ApplicationV2 build`);

  game.settings.register(MODULE_ID, "language", {
    name: t("language"), hint: t("languageHint"),
    scope: "client", config: true, type: String, default: "en",
    choices: { en: t("english"), de: t("german") },
    onChange: refreshLanguage
  });

  game.settings.register(MODULE_ID, "scale", {
    name: t("scale"),
    hint: t("scaleHint"),
    scope: "client",
    config: true,
    type: Number,
    default: 1,
    choices: {
      0.5: "50%",
      0.75: "75%",
      1: "100%",
      1.25: "125%",
      1.5: "150%"
    },
    onChange: value => updateTimelineScale(getTimelineApp(), value)
  });

  game.settings.register(MODULE_ID, "visibleTickGroups", {
    name: t("groups"),
    hint: t("groupsHint"),
    scope: "client", config: true, type: Number, default: 0,
    choices: { 0: t("all"), 3: t("nextThreePositions") },
    onChange: () => refreshTimeline()
  });
});

Hooks.once("ready", async () => {
  try {
    // Resume encounters whose initial tick normalization did not run.
    await normalizeTicks();
  } finally {
    setTimelineApp(new TimelineApp());
    await refreshTimeline({ open: true });
  }
  console.info(`${MODULE_ID} | ${MODULE_TITLE} ready`);
});

Hooks.on("renderCombatTracker", replaceCombatTracker);
Hooks.on("renderChatMessageHTML", localizeActionMessage);
Hooks.on("canvasReady", refreshTokenHighlights);
Hooks.on("refreshToken", refreshTokenHighlight);
Hooks.on("updateToken", () => refreshTimeline());

Hooks.on("createCombat", async combat => {
  if (isNormalizationAuthority()) await clearEvents(combat);
  await refreshTimeline({ open: true });
});

Hooks.on("updateCombat", async (combat, changes, options) => {
  const changedEvents = Object.hasOwn(changes ?? {}, "flags.ucurifunke.events")
    || foundry.utils.hasProperty(changes ?? {}, "flags.ucurifunke.events");
  if (!options?.tickCombatNormalization
    && (changedEvents || Object.hasOwn(changes, "round") || Object.hasOwn(changes, "active"))) {
    await normalizeTicks(combat);
  }
  await refreshTimeline();
});

Hooks.on("deleteCombat", async () => {
  await refreshTimeline();
});

Hooks.on("createCombatant", async combatant => {
  await normalizeTicks(combatant.parent);
  await refreshTimeline({ open: true });
});

Hooks.on("updateCombatant", async (combatant, changes, options) => {
  const changedTickData = Object.hasOwn(changes ?? {}, "flags.ucurifunke.data")
    || foundry.utils.hasProperty(changes, "flags.ucurifunke.data");
  const changedParticipation = ["hidden", "defeated"].some(key => Object.hasOwn(changes ?? {}, key));
  if (!options?.tickCombatNormalization && (changedTickData || changedParticipation)) {
    await normalizeTicks(combatant.parent);
  }
  await refreshTimeline();
});

Hooks.on("deleteCombatant", async combatant => {
  await normalizeTicks(combatant.parent);
  await refreshTimeline();
});

Hooks.on("updateActor", async actor => {
  const relevant = game.combat?.combatants?.some?.(combatant => combatant.actor?.id === actor.id) ?? false;
  if (relevant) await refreshTimeline();
});
