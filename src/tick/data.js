import { t } from "./i18n.js";
import { getTimelineApp } from "./state.js";
import { normalizeComplexAction } from "./complexActionData.js";

const MODULE_ID = "ucurifunke";

const DEFAULT_COMBATANT_DATA = Object.freeze({
  ticks: 0,
  isWaiting: false,
  notes: "",
  ffwd: 0,
  complexAction: null
});

function clone(value) {
  if (globalThis.structuredClone) return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}


export function isNormalizationAuthority() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users?.activeGM;
  return !activeGM || activeGM.id === game.user.id;
}

function asInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getCombatantData(combatant) {
  if (!combatant) return clone(DEFAULT_COMBATANT_DATA);

  const stored = combatant.getFlag(MODULE_ID, "data");
  if (!stored) return clone(DEFAULT_COMBATANT_DATA);

  let parsed = stored;
  if (typeof stored === "string") {
    try {
      parsed = JSON.parse(stored);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not parse legacy combatant data`, error);
      parsed = {};
    }
  }

  return {
    ...clone(DEFAULT_COMBATANT_DATA),
    ...(parsed ?? {}),
    ticks: asInteger(parsed?.ticks, 0),
    ffwd: asInteger(parsed?.ffwd, 0),
    isWaiting: Boolean(parsed?.isWaiting),
    notes: String(parsed?.notes ?? ""),
    complexAction: normalizeComplexAction(parsed?.complexAction)
  };
}

export async function setCombatantData(combatant, data) {
  if (!combatant) return;
  const normalized = {
    ticks: asInteger(data?.ticks, 0),
    isWaiting: Boolean(data?.isWaiting),
    notes: String(data?.notes ?? ""),
    ffwd: asInteger(data?.ffwd, 0),
    complexAction: normalizeComplexAction(data?.complexAction)
  };
  await combatant.setFlag(MODULE_ID, "data", JSON.stringify(normalized));
}

export async function setTicks(combatant, value = 0) {
  const data = getCombatantData(combatant);
  data.ticks = asInteger(value, 0);
  if (data.ticks > 0) data.isWaiting = false;
  await setCombatantData(combatant, data);
}

export async function setNote(combatant, value = "") {
  const data = getCombatantData(combatant);
  data.notes = String(value ?? "");
  await setCombatantData(combatant, data);
}

export async function toggleWaiting(combatant) {
  const data = getCombatantData(combatant);
  if (data.complexAction) return;
  data.isWaiting = !data.isWaiting;
  await setCombatantData(combatant, data);
}

export function getCombatant(id) {
  const combatants = game.combat?.combatants;
  if (!combatants || !id) return null;
  return combatants.get?.(id) ?? [...combatants].find(c => c.id === id) ?? null;
}

function userCanWait(combatant) {
  if (game.user?.isGM) return true;
  return combatant.players?.some(user => user.id === game.user?.id) ?? false;
}

export function getCombatantInfo(combatant) {
  const data = getCombatantData(combatant);
  return {
    id: combatant.id,
    combatant,
    name: combatant.name ?? combatant.actor?.name ?? t("combatant"),
    isEvent: false,
    ticks: data.ticks,
    canWait: !data.complexAction && userCanWait(combatant) && data.ticks === 0,
    complexAction: data.complexAction,
    isWaiting: data.isWaiting,
    notes: data.notes,
    ffwd: data.ffwd
  };
}

export function getEvents(combat = game.combat) {
  const events = combat?.getFlag(MODULE_ID, "events");
  return Array.isArray(events) ? clone(events) : [];
}

export async function setEvents(events) {
  if (!game.combat) return;
  await game.combat.setFlag(MODULE_ID, "events", clone(events ?? []));
}

export async function clearEvents(combat = game.combat) {
  if (!game.user?.isGM || !combat) return;
  await combat.unsetFlag(MODULE_ID, "events");
  await combat.unsetFlag(MODULE_ID, "totalTicks");
}

export async function addEvent(event) {
  if (!game.combat) return;
  const events = getEvents();
  const created = {
    ...clone(event),
    id: crypto.randomUUID(),
    isEvent: true,
    name: String(event?.name ?? t("newEvent")),
    notes: String(event?.notes ?? ""),
    ticks: asInteger(event?.ticks, 0),
    repeating: Boolean(event?.repeating),
    ffwd: Boolean(event?.repeating) ? asInteger(event?.ffwd, 8) : -1,
    isHidden: Boolean(event?.isHidden)
  };
  events.push(created);
  await setEvents(events);
}

export async function removeEvent(event) {
  if (!event?.id) return;
  const events = getEvents().filter(existing => existing.id !== event.id);
  await setEvents(events);
}

export async function updateEvent(event) {
  if (!event?.id) return;
  const events = getEvents();
  const index = events.findIndex(existing => existing.id === event.id);
  if (index < 0) return;

  const updated = {
    ...clone(event),
    isEvent: true,
    name: String(event.name ?? t("event")),
    notes: String(event.notes ?? ""),
    ticks: asInteger(event.ticks, 0),
    repeating: Boolean(event.repeating),
    ffwd: event.repeating ? asInteger(event.ffwd, 8) : -1,
    isHidden: Boolean(event.isHidden)
  };

  events[index] = updated;
  await setEvents(events);
}

export async function toggleHideEvent(event) {
  if (!event) return;
  await updateEvent({ ...event, isHidden: !event.isHidden });
}

export function getEventById(id) {
  if (!id) return null;
  return getEvents().find(event => event.id === id) ?? null;
}

export function getCombatantAndEventsList({ combat = game.combat, forDisplay = true } = {}) {
  const combatants = combat?.combatants;
  if (!combatants) return [];

  const result = [];
  for (const combatant of combatants) {
    const tokenHidden = combatant.token?.hidden ?? false;
    if (!combatant.hidden && !tokenHidden && !combatant.isDefeated) {
      result.push(getCombatantInfo(combatant));
    }
  }

  let events = getEvents(combat);
  if (forDisplay && !game.user?.isGM) events = events.filter(event => !event.isHidden);

  return [...result, ...events].sort((a, b) => {
    const tickDifference = asInteger(a.ticks) - asInteger(b.ticks);
    if (tickDifference !== 0) return tickDifference;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

// The active GM serializes additive bookings and timeline advancement per encounter.
const normalizationQueues = new WeakMap();

export function normalizeTicks(combat = game.combat) {
  if (!combat?.started || !isNormalizationAuthority()) return Promise.resolve();
  const previous = normalizationQueues.get(combat) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!combat.started || !isNormalizationAuthority()) return;
    for (const combatant of combat.combatants) {
      const pending = combatant.getFlag(MODULE_ID, "pendingTicks") ?? {};
      const requests = Object.entries(pending).filter(([id, ticks]) =>
        /^[a-zA-Z0-9]+$/.test(id) && Number.isInteger(ticks) && ticks > 0 && ticks <= 32);
      if (!requests.length) continue;
      const data = getCombatantData(combatant);
      data.ticks += requests.reduce((sum, [, ticks]) => sum + ticks, 0);
      if (data.ticks > 0) data.isWaiting = false;
      const update = Object.fromEntries(requests.map(([id]) => [`flags.ucurifunke.pendingTicks.-=${id}`, null]));
      update["flags.ucurifunke.data"] = JSON.stringify(data);
      await combatant.update(update, { tickCombatNormalization: true });
    }
    await normalizeCombat(combat);
  });
  normalizationQueues.set(combat, next);
  return next;
}

export async function queueActionTicks(combatant, ticks) {
  if (!game.users?.activeGM && !game.user?.isGM) {
    throw new Error("Für Tickbuchungen muss eine Spielleitung verbunden sein.");
  }
  const combat = combatant.parent;
  // The player persists a delta under a unique key, so concurrent clients never
  // replace each other's requests or write an outdated combatant tick total.
  const id = foundry.utils.randomID();
  await combatant.update({ [`flags.ucurifunke.pendingTicks.${id}`]: ticks });
  if (isNormalizationAuthority()) await normalizeTicks(combat);
  // Requests remain persisted if the authority disconnects while processing.
  for (let attempt = 0; attempt < 100; attempt++) {
    if (combatant.getFlag(MODULE_ID, "pendingTicks")?.[id] === undefined) return;
    if (!combat.started || !combat.combatants.has(combatant.id)) break;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  ui.notifications.warn("Die Tickbuchung wurde vorgemerkt und wartet auf die Spielleitung.");
}

async function normalizeCombat(combat) {
  if (!combat.started || !isNormalizationAuthority()) return;
  const timeline = getCombatantAndEventsList({ combat, forDisplay: false });
  const active = timeline.filter(item => !item.isWaiting);
  if (!active.length) return;

  const normalization = asInteger(active[0].ticks, 0);
  if (normalization === 0) return;

  const updates = active.filter(item => !item.isEvent).map(item => ({
    _id: item.id,
    "flags.ucurifunke.data": JSON.stringify({
      ...getCombatantData(item.combatant),
      ticks: asInteger(item.ticks, 0) - normalization
    })
  }));
  if (updates.length) {
    await combat.updateEmbeddedDocuments("Combatant", updates, { tickCombatNormalization: true });
  }

  const events = getEvents(combat).map(event => event.isWaiting ? event : {
    ...event, ticks: asInteger(event.ticks, 0) - normalization
  });
  const totalTicks = asInteger(combat.getFlag(MODULE_ID, "totalTicks"), 0);
  // Embedded updates add their parent to the operation. Never reuse that
  // operation for the world-level Combat update.
  await combat.update({
    "flags.ucurifunke.events": events,
    // Corrections to earlier tick positions must not reduce elapsed time.
    "flags.ucurifunke.totalTicks": totalTicks + Math.max(0, normalization)
  }, { tickCombatNormalization: true });

  const app = getTimelineApp();
  app?.render();
  app?.fitToTimeline?.();
}
