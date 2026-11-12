import { medianDie, renderCheckCard, skillDice } from "./check-card.js";
import { postDiceMessage } from "./dice-message.js";

export function evaluateCheck(check, dice, modifier = 0, confirmation) {
  const target = check.value + modifier;
  let quality;
  let critical = false;
  let fumble = false;
  let success;
  if (check.kind === "combat") {
    const succeeds = roll => roll === 1 || (roll !== 20 && roll <= target);
    quality = target - dice[0];
    critical = dice[0] === 1 && confirmation != null && succeeds(confirmation);
    fumble = dice[0] === 20 && confirmation != null && !succeeds(confirmation);
    success = succeeds(dice[0]) && (dice[0] === 1 || Math.min(quality, modifier > 0 ? check.value : Infinity) >= 0);
  } else {
    if (check.kind === "skill") {
      const deficits = skillDice(check, dice, target).reduce((sum, die) => sum + die.difference, 0);
      quality = Math.max(0, target) - deficits;
    } else {
      quality = target - medianDie(dice).value;
    }
    critical = dice.filter(roll => roll === 1).length >= 2;
    fumble = dice.filter(roll => roll === 20).length >= 2;
    success = critical || (!fumble && (modifier > 0 ? Math.min(quality, check.value) : quality) >= 0);
  }
  if (modifier > 0) quality = Math.min(quality, check.value);
  return { quality, success, critical, fumble };
}

export function weaponCheck(actor, weapon, mode) {
  const data = weapon?.system;
  const base = mode === "PA" ? data?.parry : data?.attack;
  if (!Number.isInteger(base)) return null;
  const impairment = Math.max(0, actor.system.impairment - data.mobilityTolerance);
  const joints = mode === "PA" && actor.system.hasJointPenalty ? 2 : 0;
  return { kind: "combat", name: mode + " · " + weapon.name, mode, weapon: weapon.name,
    technique: data.technique, breakdown: mode === "PA" ? data.parryBreakdown : data.attackBreakdown,
    impairment, joints, value: base - impairment - joints };
}

export async function prepareRoll(check) {
  const type = { attribute: "Attributsprobe", skill: "Fertigkeitsprobe" }[check.kind];
  const options = await foundry.applications.api.DialogV2.input({
    window: { title: type ? type + ": " + check.name : check.name },
    content: `<div class="ucurifunke-modifier-dialog">
      <div class="form-group">
        <label for="ucurifunke-difficulty">Erschwernis</label>
        <input id="ucurifunke-difficulty" name="difficulty" type="number" min="0" step="1" value="0" autofocus>
      </div>
      <div class="form-group">
        <label for="ucurifunke-relief">Erleichterung</label>
        <input id="ucurifunke-relief" name="relief" type="number" min="0" step="1" value="0">
      </div>
      <div class="form-group">
        <label for="ucurifunke-blind">Verdeckte Probe</label>
        <input id="ucurifunke-blind" name="blind" type="checkbox">
      </div>
    </div>`,
    rejectClose: false, modal: true,
    ok: { label: "Würfeln", icon: "fa-solid fa-dice-d20" },
    render: (_event, dialog) => {
      for (const input of dialog.element.querySelectorAll('input[name="difficulty"], input[name="relief"]')) {
        const clearZero = () => { if (input.value === "0") input.value = ""; };
        input.addEventListener("focus", clearZero);
        input.addEventListener("click", clearZero);
      }
    }
  });
  if (!options) return null;
  const nonNegativeInteger = value => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
  return {
    penalty: nonNegativeInteger(options.difficulty),
    bonus: nonNegativeInteger(options.relief),
    blind: [true, 1, "1", "true", "on"].includes(options.blind)
  };
}

export async function postRoll(actor, check, modifiers) {
  const Roll = foundry.dice.Roll;
  const combat = check.kind === "combat";
  const roll = await new Roll(combat ? "1d20" : "3d20").evaluate();
  const dice = roll.dice[0].results.map(die => die.result);
  const confirmation = combat && [1, 20].includes(dice[0]) ? await new Roll("1d20").evaluate() : null;
  const result = evaluateCheck(check, dice, modifiers.bonus - modifiers.penalty, confirmation?.total);
  const content = renderCheckCard(check, dice, modifiers, result, confirmation?.total);
  const rolls = confirmation ? [roll, confirmation] : [roll];
  const hiddenCheck = { characterName: actor.name, subject: combat ? check.technique || check.weapon : check.name };
  await postDiceMessage(content, rolls, {
    actor, mode: modifiers.blind ? "blind" : undefined,
    flags: modifiers.blind ? { ucurifunke: { hiddenCheck } } : undefined
  });
}

export function renderHiddenCheck(message, html) {
  if (!message.isAuthor || message.isContentVisible !== false) return;
  const hidden = message.getFlag("ucurifunke", "hiddenCheck");
  if (!hidden) return;
  const content = html.querySelector(".message-content, .chat-message-content");
  if (!content) return;
  const character = document.createElement("strong");
  character.textContent = hidden.characterName ?? "Charakter";
  const subject = document.createElement("strong");
  subject.textContent = hidden.subject ?? "Probe";
  content.replaceChildren(character, " hat eine verborgene Probe abgelegt auf: ", subject);
  html.querySelector(".message-flavor")?.remove();
}
