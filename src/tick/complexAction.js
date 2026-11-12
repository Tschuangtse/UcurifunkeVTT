import { t } from "./i18n.js";
import { getCombatantData, normalizeTicks, setCombatantData } from "./data.js";
import { COMPLEX_ACTION_INTERVAL, isComplexActionDuration } from "./complexActionData.js";

const pendingUpdates = new WeakSet();
const pendingDialogs = new WeakSet();

function escapeChatText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function announceComplexAction(combatant, name, outcome) {
  const actorName = combatant.name ?? combatant.actor?.name ?? t("combatant");
  try {
    const ChatMessage = foundry.documents.ChatMessage;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: combatant.actor, token: combatant.token, alias: actorName }),
      content: t(outcome, { actor: escapeChatText(actorName), action: escapeChatText(name) }),
      flags: { "ucurifunke": { actionOutcome: { outcome, actor: actorName, action: name } } }
    });
  } catch (error) {
    console.error("Tick Based Combat | Could not post complex action outcome", error);
    ui.notifications?.warn(t("chatFailed"));
  }
}

function stepDuration(target, direction) {
  const input = target.closest(".tick-combat-duration")?.querySelector('input[name="duration"]');
  if (!input) return;
  input.stepUp(direction);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function canManageComplexAction(combatant) {
  return Boolean(combatant && combatant.parent === game.combat && !combatant.hidden
    && !combatant.token?.hidden && !combatant.isDefeated
    && (game.user?.isGM || combatant.isOwner));
}

export function getSelectedCombatant() {
  const controlled = globalThis.canvas?.tokens?.controlled ?? [];
  if (controlled.length !== 1) return null;
  const token = controlled[0];
  return game.combat?.combatants?.find(combatant => combatant.tokenId === token.id
    && combatant.sceneId === token.document?.parent?.id) ?? null;
}

export async function beginComplexAction(combatant, { name, duration }) {
  name = String(name ?? "").trim();
  if (!canManageComplexAction(combatant) || !name || !isComplexActionDuration(duration)
    || pendingUpdates.has(combatant)) return false;
  const data = getCombatantData(combatant);
  if (data.complexAction) return false;
  pendingUpdates.add(combatant);
  try {
    await setCombatantData(combatant, {
      ...data,
      ticks: data.ticks + COMPLEX_ACTION_INTERVAL,
      isWaiting: false,
      complexAction: duration > COMPLEX_ACTION_INTERVAL
        ? { name, duration, spent: COMPLEX_ACTION_INTERVAL } : null
    });
    if (duration === COMPLEX_ACTION_INTERVAL) await announceComplexAction(combatant, name, "actionFinished");
    await normalizeTicks(combatant.parent);
    return true;
  } finally { pendingUpdates.delete(combatant); }
}

export function canAdvanceComplexAction(combatant) {
  if (!canManageComplexAction(combatant)) return false;
  const data = getCombatantData(combatant);
  return Boolean(data.complexAction && data.ticks === 0);
}

export async function advanceComplexAction(combatant) {
  if (!canAdvanceComplexAction(combatant) || pendingUpdates.has(combatant)) return false;
  pendingUpdates.add(combatant);
  try {
    const data = getCombatantData(combatant);
    const action = data.complexAction;
    const spent = action.spent + COMPLEX_ACTION_INTERVAL;
    await setCombatantData(combatant, {
      ...data,
      ticks: COMPLEX_ACTION_INTERVAL,
      complexAction: spent < action.duration ? { ...action, spent } : null
    });
    if (spent === action.duration) await announceComplexAction(combatant, action.name, "actionFinished");
    await normalizeTicks(combatant.parent);
    return true;
  } finally { pendingUpdates.delete(combatant); }
}

export async function cancelComplexAction(combatant) {
  if (!canManageComplexAction(combatant) || pendingUpdates.has(combatant)) return false;
  const data = getCombatantData(combatant);
  if (!data.complexAction) return false;
  pendingUpdates.add(combatant);
  try {
    await setCombatantData(combatant, { ...data, complexAction: null });
    await announceComplexAction(combatant, data.complexAction.name, "actionCancelled");
    return true;
  } finally { pendingUpdates.delete(combatant); }
}

export async function promptComplexAction() {
  const combatant = getSelectedCombatant();
  if (!canManageComplexAction(combatant)) {
    ui.notifications?.warn(t("selectToken"));
    return false;
  }
  if (getCombatantData(combatant).complexAction) {
    ui.notifications?.warn(t("alreadyActing"));
    return false;
  }
  if (pendingDialogs.has(combatant)) return false;
  pendingDialogs.add(combatant);
  try {
    // DialogV2 requires an attribute-free outer div.
    const content = document.createElement("div");
    content.innerHTML = `<div class="tick-combat-dialog"><div class="tick-combat-fields">
      <label class="tick-combat-field"><span>${t("action")}</span>
        <input name="name" type="text" required autofocus autocomplete="off">
      </label>
      <label class="tick-combat-field"><span>${t("duration")}</span>
        <span class="tick-combat-duration">
          <input class="tick-combat-duration-input" name="duration" aria-label="${t("duration")}" type="number" min="8" step="8" value="8" required>
          <button type="button" class="tick-combat-duration-step" data-action="increaseComplexDuration" title="${t("increaseDuration")}" aria-label="${t("increaseDuration")}"><i class="fa-solid fa-caret-up" aria-hidden="true"></i></button>
          <button type="button" class="tick-combat-duration-step" data-action="decreaseComplexDuration" title="${t("decreaseDuration")}" aria-label="${t("decreaseDuration")}"><i class="fa-solid fa-caret-down" aria-hidden="true"></i></button>
        </span>
      </label>
    </div></div>`;
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: t("complexAction") },
      content, modal: true, rejectClose: false,
      actions: {
        increaseComplexDuration: (_event, target) => stepDuration(target, 1),
        decreaseComplexDuration: (_event, target) => stepDuration(target, -1)
      },
      ok: { label: t("beginAction"), icon: "fa-solid fa-hourglass-start" }
    });
    if (!result) return false;
    const name = String(result.name ?? "").trim();
    const duration = Number(result.duration);
    if (!name || !isComplexActionDuration(duration)) {
      ui.notifications?.warn(t("invalidAction"));
      return false;
    }
    if (getSelectedCombatant() !== combatant) return false;
    return await beginComplexAction(combatant, { name, duration });
  } finally { pendingDialogs.delete(combatant); }
}
