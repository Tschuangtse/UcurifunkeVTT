import { medianDie, renderCheckCard, skillDice } from "./check-card.js";
import { postDiceMessage } from "./dice-message.js";
import { combatFocus, focusModifier } from "./combat-focus.js";
import { effectiveTicks, weaponTickFields } from "./weapon-ticks.js";
import { conditionEffects } from "./conditions.js";

export function evaluateCheck(check, dice, modifier = 0, confirmation) {
  const target = check.value + modifier;
  if (check.title === "Ausweichen" || check.mode === "AT" && check.exchange?.mode === "AT") {
    const quality = target - dice[0];
    return { quality, success: quality >= 0 && (check.opposedQuality == null || quality > check.opposedQuality),
      critical: false, fumble: false };
  }
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
  const action = { AT: "melee", PA: "parry", FK: "ranged" }[mode];
  const ticks = effectiveTicks(actor, action, weapon.id, weaponTickFields(weapon).find(field => field.action === action)?.source);
  if (data.preparedCheck) {
    const original = (mode === "PA" ? actor.system.defensiveFocus : actor.system.offensiveFocus) ?? 0;
    const focus = mode === "FK" ? 0 : focusModifier(actor, mode, original) - original;
    return { kind: "combat", name: mode + " · " + weapon.name, mode,
    attackName: weapon.name, value: base + focus, focusDelta: focus,
    ticks };
  }
  const impairment = Math.max(0, actor.system.impairment - data.mobilityTolerance);
  const joints = mode === "PA" && actor.system.hasJointPenalty ? 2 : 0;
  const imported = mode === "PA" ? data.parryBreakdown : data.attackBreakdown;
  const original = imported?.[2] ?? (mode === "PA" ? actor.system.defensiveFocus : actor.system.offensiveFocus) ?? 0;
  const focus = focusModifier(actor, mode, original);
  const delta = mode === "FK" ? 0 : focus - original;
  const breakdown = imported?.length === 4 ? [imported[0], imported[1], focus, imported[3]] : imported;
  return { kind: "combat", name: mode + " · " + weapon.name, mode, weapon: weapon.name,
    technique: data.technique, breakdown, focusDelta: breakdown?.length === 4 ? 0 : delta,
    impairment, joints, ticks, value: base + delta - impairment - joints };
}

export function dodgeValue(actor) {
  const data = actor.system;
  const derived = data.derived?.find(row => row.key.toUpperCase() === "AW")?.value;
  const defense = data.derived?.find(row => row.key.toUpperCase() === "DEF")?.value;
  const base = Number.isFinite(defense) && Number.isFinite(data.reaction) ? defense + data.reaction : derived;
  return data.dodgeOverride ?? (Number.isFinite(base) ? Math.round(base) : null);
}

export function dodgeCheck(actor, { ticks = 0, running = false, posture = 0, cramped = 0 } = {}) {
  const base = dodgeValue(actor);
  if (!Number.isInteger(base)) return null;
  const focus = -combatFocus(actor);
  const impairment = actor.system.impairment ?? 0;
  const reaction = Math.max(0, Math.floor(ticks / 10)) * 4;
  const penalties = [["Reaktion bei " + ticks + " Ticks", reaction], ["Nach dem Rennen", running ? 4 : 0],
    ["Überanstrengung (RE)", conditionEffects(actor.system).reactionPenalty],
    ["Körperlage", posture], ["Beengte Umgebung", cramped]].filter(([, value]) => value);
  return { kind: "combat", mode: "PA", title: "Ausweichen", name: "Ausweichen", impairment,
    breakdown: [base, 0, focus, 0], penalties, value: base + focus - impairment - penalties.reduce((n, [, v]) => n + v, 0) };
}

const MAX_MODIFIER = Number.MAX_SAFE_INTEGER;
const validModifier = value => Number.isSafeInteger(value) && value >= 0;
const normalizeModifier = value => validModifier(Number(value)) ? Number(value) : 0;

export async function prepareRoll(check, fields = "", { allowBlind = true } = {}) {
  const type = { attribute: "Attributsprobe", skill: "Fertigkeitsprobe" }[check.kind];
  const options = await foundry.applications.api.DialogV2.input({
    window: { title: type ? type + ": " + check.name : check.name },
    content: `<div class="ucurifunke-modifier-dialog">
      ${fields}
      <div class="form-group">
        <label for="ucurifunke-difficulty">Erschwernis</label>
        <input id="ucurifunke-difficulty" name="difficulty" type="number" min="0" max="${MAX_MODIFIER}" step="1" value="0" placeholder="0">
      </div>
      <div class="form-group">
        <label for="ucurifunke-relief">Erleichterung</label>
        <input id="ucurifunke-relief" name="relief" type="number" min="0" max="${MAX_MODIFIER}" step="1" value="0" placeholder="0">
      </div>
      ${allowBlind ? `<div class="form-group">
        <label for="ucurifunke-blind">Verdeckte Probe</label>
        <input id="ucurifunke-blind" name="blind" type="checkbox">
      </div>` : ""}
    </div>`,
    rejectClose: false, modal: true,
    ok: { label: "Würfeln", icon: "fa-solid fa-dice-d20" },
    render: (_event, dialog) => {
      const inputs = [...dialog.element.querySelectorAll('input[name="difficulty"], input[name="relief"]')];
      const submit = dialog.element.querySelector('button[data-action="ok"], button[type="submit"]');
      const refresh = () => {
        if (submit) submit.disabled = inputs.some(input => !input.validity.valid);
      };
      for (const input of inputs) {
        input.addEventListener("click", () => {
          if (input.value === "0") {
            input.value = "";
            refresh();
          }
        });
        input.addEventListener("keydown", event => {
          if (["-", "+", ".", ",", "e", "E"].includes(event.key) && !event.ctrlKey && !event.metaKey) event.preventDefault();
        });
        input.addEventListener("blur", () => {
          if (!input.value && input.validity.valid) input.value = "0";
        });
        input.addEventListener("paste", event => {
          if (!/^\d+$/.test(event.clipboardData?.getData("text")?.trim() ?? "")) event.preventDefault();
        });
        input.addEventListener("input", refresh);
      }
    }
  });
  if (!options) return null;
  return {
    penalty: normalizeModifier(options.difficulty),
    bonus: normalizeModifier(options.relief),
    blind: allowBlind && [true, 1, "1", "true", "on"].includes(options.blind),
    ...(fields ? { fields: options } : {})
  };
}

export async function postRoll(actor, check, modifiers = {}, speaker) {
  modifiers = { ...modifiers, penalty: normalizeModifier(modifiers.penalty), bonus: normalizeModifier(modifiers.bonus) };
  const Roll = foundry.dice.Roll;
  const combat = check.kind === "combat";
  const roll = await new Roll(combat ? "1d20" : "3d20").evaluate();
  const dice = roll.dice[0].results.map(die => die.result);
  const opposed = check.title === "Ausweichen" || check.exchange?.mode === "AT";
  const confirmation = combat && !opposed && [1, 20].includes(dice[0]) ? await new Roll("1d20").evaluate() : null;
  const result = evaluateCheck(check, dice, modifiers.bonus - modifiers.penalty, confirmation?.total);
  const content = renderCheckCard(check, dice, modifiers, result, confirmation?.total);
  const rolls = confirmation ? [roll, confirmation] : [roll];
  return postDiceMessage(content, rolls, {
    actor, speaker, mode: modifiers.blind ? "blind" : modifiers.mode,
    hiddenSubject: check.name, exchange: check.exchange && { ...check.exchange, quality: result.quality, success: result.success }
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
