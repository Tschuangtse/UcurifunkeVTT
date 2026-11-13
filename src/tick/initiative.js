import { SYSTEM_DIALOG_CLASSES } from "../appearance.js";
import { t } from "./i18n.js";
import { getCombatantData, setCombatantData } from "./data.js";
import { conditionEffects } from "../conditions.js";

export function canRollInitiative(combatant) {
  return Boolean(combatant?.parent && !combatant.parent.started
    && !getCombatantData(combatant).complexAction
    && (game.user?.isGM || combatant.isOwner));
}

export function validateInitiativeValues(reaction, impairment) {
  return [reaction, impairment].every(value => Number.isSafeInteger(value) && value >= 0);
}

export async function rollInitiative(combatant) {
  if (!canRollInitiative(combatant)) return;
  const combat = combatant.parent;
  const data = combatant.actor?.system;
  const { reaction: actorReaction, impairment: actorImpairment } = data ?? {};
  const reactionPenalty = data ? conditionEffects(data).reactionPenalty : 0;
  const initialReaction = Number.isSafeInteger(actorReaction) ? Math.max(0, actorReaction - reactionPenalty) : 0;
  const initialImpairment = Number.isSafeInteger(actorImpairment) && actorImpairment >= 0 ? actorImpairment : 0;
  const content = document.createElement("div");
  content.innerHTML = `
    <div class="tick-combat-dialog">
    <div class="tick-combat-fields">
      <label class="tick-combat-field"><span>${t("reaction")}</span>
        <input class="tick-combat-initiative-input" name="reaction" type="number" min="0" step="1" value="${initialReaction}" required autofocus>
      </label>
      <label class="tick-combat-field"><span>${t("impairment")}</span>
        <input class="tick-combat-initiative-input" name="impairment" type="number" min="0" step="1" value="${initialImpairment}" required>
      </label>
      <p>${t("initiativeFormula")}</p>
    </div>
    </div>`;
  const result = await foundry.applications.api.DialogV2.input({
    classes: SYSTEM_DIALOG_CLASSES,
    window: { title: t("initiativeTitle", { name: combatant.name ?? t("combatant") }) },
    content, modal: true, rejectClose: false,
    ok: { label: t("rollInitiative"), icon: "fa-solid fa-dice-d6" }
  });
  if (!result) return;
  const reaction = Number(result.reaction);
  const impairment = Number(result.impairment);
  if (!validateInitiativeValues(reaction, impairment)) {
    ui.notifications?.warn(t("invalidInitiative"));
    return;
  }
  if (!canRollInitiative(combatant) || combat !== game.combat) return;
  const roll = await new foundry.dice.Roll(
    "30 - @reaction + @impairment - 1d6", { reaction, impairment }
  ).evaluate();
  // A GM may have started the encounter while the dialog or roll was open.
  if (!canRollInitiative(combatant) || combat !== game.combat) return;
  await setCombatantData(combatant, {
    ...getCombatantData(combatant), ticks: roll.total, isWaiting: false
  });
}
