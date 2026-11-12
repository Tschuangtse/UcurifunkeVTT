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
      const deficits = dice.reduce((sum, roll, index) =>
        sum + Math.max(0, roll - check.attributes[index].value - Math.min(0, target)), 0);
      quality = Math.max(0, target) - deficits;
    } else {
      quality = target - [...dice].sort((left, right) => left - right)[1];
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
  return { kind: "combat", name: mode + " · " + weapon.name, value: base - impairment - joints };
}

export async function prepareRoll(check) {
  const content = document.createElement("div");
  content.innerHTML = '<div class="ucurifunke-modifiers"><label>Erschwernis <input type="number" name="penalty" value="0" min="0" max="10000" required></label><label>Erleichterung <input type="number" name="bonus" value="0" min="0" max="10000" required></label></div>';
  const options = await foundry.applications.api.DialogV2.input({
    window: { title: check.name }, content, rejectClose: false, modal: true,
    ok: { label: "Würfeln", icon: "fa-solid fa-dice-d20" }
  });
  if (!options) return null;
  const modifiers = [Number(options.penalty), Number(options.bonus)];
  if (!modifiers.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 10000)) {
    throw new Error("Bitte gültige ganzzahlige Modifikatoren eingeben.");
  }
  return modifiers[1] - modifiers[0];
}

export async function postRoll(actor, check, modifier) {
  const Roll = foundry.dice.Roll;
  const combat = check.kind === "combat";
  const roll = await new Roll(combat ? "1d20" : "3d20").evaluate();
  const dice = roll.dice[0].results.map(die => die.result);
  const confirmation = combat && [1, 20].includes(dice[0]) ? await new Roll("1d20").evaluate() : null;
  const result = evaluateCheck(check, dice, modifier, confirmation?.total);
  const outcome = result.critical ? "Kritischer Erfolg" : result.fumble ? "Patzer" : result.success ? "Gelungen" : "Misslungen";
  const flavor = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = check.name;
  const details = document.createElement("p");
  const targets = check.attributes?.map(attribute => attribute.name + " " + attribute.value).join(" · ");
  details.textContent = [targets, "Probenwert " + check.value, "Modifikator " + modifier,
    "Würfel " + dice.join(", "), confirmation && "Bestätigung " + confirmation.total,
    outcome + " · Qualität " + result.quality].filter(Boolean).join(" | ");
  flavor.append(title, details);
  const ChatMessage = foundry.documents.ChatMessage;
  const message = { speaker: ChatMessage.getSpeaker({ actor }), flavor: flavor.innerHTML,
    rolls: (confirmation ? [roll, confirmation] : [roll]).map(result => result.toJSON()),
    sound: CONFIG.sounds.dice };
  await ChatMessage.create(ChatMessage.applyMode(message));
}
