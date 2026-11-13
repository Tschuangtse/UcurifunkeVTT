import { addActionTicks, assertSameSelection, getSelection } from "./actions/combat.js";
import { escapeHtml } from "./check-card.js";
import { dodgeCheck, postRoll, prepareRoll, weaponCheck } from "./checks.js";
import { getCombatantInfo, queueActionTicks } from "./tick/data.js";
import { applyConditionEffects } from "./conditions.js";
import { postDiceMessage } from "./dice-message.js";
import { techniqueCheck, techniqueSettings } from "./technique-check.js";

const pending = new Set();

export const dodgeFields = `<div>
  <label><input type="checkbox" name="aware" required> Angriff wahrgenommen und nicht umzingelt</label>
  <label><input type="checkbox" name="running"> Seit dem letzten eigenen Zug gerannt</label>
  <label>Körperlage <select name="posture"><option value="0">Stehend</option><option value="2">Kniend</option><option value="4">Liegend</option></select></label>
  <label>Beengte Umgebung <select name="cramped"><option value="0">Kein Abzug</option><option value="2">−2</option><option value="4">−4</option></select></label>
</div>`;

export function dodgeOptions(fields, ticks) {
  if (![true, "on", "true", 1].includes(fields?.aware)) return null;
  return { ticks, running: [true, "on", "true", 1].includes(fields.running),
    posture: Number(fields.posture), cramped: Number(fields.cramped) };
}

export function selectedAttackTarget(actor, check) {
  if (!["AT", "FK"].includes(check.mode)) return null;
  const targets = [...(globalThis.game?.user?.targets ?? [])];
  if (targets.length !== 1) return null;
  const { document, actor: defender } = targets[0];
  const self = actor.token?.uuid ?? globalThis.canvas?.tokens?.controlled?.find(token => token.actor?.uuid === actor.uuid)?.document.uuid;
  return document?.uuid && !document.hidden && defender && document.uuid !== self
    ? { uuid: document.uuid, name: document.name } : null;
}

export function linkAttack(actor, check, target, damage, bookedTicks) {
  const exchange = target && { type: "attack", mode: check.mode, target: target.uuid, attacker: actor.uuid, damage: damage || "" };
  return { ...check, bookedTicks, ...(exchange ? { targetName: target.name, exchange } : {}) };
}

export function damageFormula(input) {
  const value = String(input ?? "").replace(/\s+/g, "").replaceAll("−", "-");
  const terms = value.match(/[+-]?[^+-]+/g) ?? [];
  if (!terms.length || terms.length > 8 || terms.join("") !== value) return null;
  const valid = /^[+-]?(?:\d{1,4}|(?:[1-9]\d?)?[wd](?:3|4|6|8|10|12|20|100))$/i;
  if (!terms.every((term, index) => valid.test(term) && (index === 0 || /^[+-]/.test(term)))) return null;
  return terms.map(term => term.replace(/(^[+-]?)[wd]/i, (_match, sign) => sign + "1d").replace(/w/i, "d")).join("");
}

export function armorProtection(actor) {
  return (actor.system.naturalArmor ?? 0) + (actor.system.companionArmor ?? actor.items
    .filter(item => item.system.group === "Rüstung" && item.system.equipped && item.system.carried)
    .reduce((total, item) => total + Math.max(0, item.system.protection), 0));
}

function exchangeData(message) {
  return message.getFlag("ucurifunke", "exchange");
}

function canRespond(message) {
  const attack = exchangeData(message);
  if (attack?.type !== "attack" || !attack.success || !message.isContentVisible || message.blind || message.whisper.length) return null;
  const token = foundry.utils.fromUuidSync(attack.target);
  if (!token?.actor || token.hidden) return null;
  const responses = game.messages.filter(other => !other.blind && !other.whisper.length
    && exchangeData(other)?.attack === message.id).map(exchangeData);
  const defense = responses.find(response => response.type === "defense");
  const damage = responses.some(response => response.type === "damage");
  const attacker = foundry.utils.fromUuidSync(attack.attacker);
  return { attack, token, defender: token.actor, attacker, defense, damage };
}

function allowed(state, action) {
  if (!state) return false;
  if (action === "dodge") return !state.defense && state.attack.mode === "AT" && Number.isInteger(state.attack.quality)
    && Boolean(dodgeCheck(state.defender)) && Boolean(reactionCombatant(state.token))
    && (game.user.isGM || state.defender.isOwner);
  if (action === "parry" || action === "skip") return !state.defense && (game.user.isGM || state.defender.isOwner);
  return action === "damage" && state.defense && !state.defense.success && !state.damage
    && (game.user.isGM || state.attacker?.isOwner);
}

function reactionCombatant(token) {
  return game.combats.find(c => c.started && c.active && c.scene?.id === token.parent.id)
    ?.combatants.find(c => c.tokenId === token.id && !c.isDefeated);
}

function ensure(message, action) {
  const state = game.messages.has(message.id) && canRespond(message);
  if (!allowed(state, action)) throw new Error("Diese Kampfreaktion ist nicht mehr verfügbar.");
  return state;
}

function postResponse(actor, message, type, content, rolls = []) {
  return postDiceMessage(content, rolls, { actor, mode: "public",
    exchange: { type, attack: message.id, success: false } });
}

async function respond(message, action) {
  const state = ensure(message, action);
  const { defender, attacker, attack, token } = state;
  if (action === "dodge") {
    const combatant = reactionCombatant(token);
    if (!combatant) throw new Error("Für Ausweichen muss das Ziel am laufenden Tickkampf teilnehmen.");
    if (!game.users.activeGM && !game.user.isGM) throw new Error("Für Tickbuchungen muss eine Spielleitung verbunden sein.");
    const check = dodgeCheck(defender);
    const options = await prepareRoll(check, dodgeFields, { allowBlind: false });
    if (!options) return;
    ensure(message, action);
    const situation = dodgeOptions(options.fields, getCombatantInfo(combatant).ticks);
    if (!situation || reactionCombatant(token) !== combatant) return;
    const adjusted = applyConditionEffects(defender, dodgeCheck(defender, situation));
    const response = await postRoll(defender, { ...adjusted, opposedQuality: attack.quality, targetName: token.name,
      exchange: { type: "defense", attack: message.id } }, { ...options, mode: "public" });
    if (response) {
      await queueActionTicks(combatant, 4);
      await response.update({ content: response.content.replace("</footer>", "</footer><p>Gebuchte Ticks: <strong>4</strong></p>") });
    }
    return response;
  }
  if (action === "skip") {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Auf Parade verzichten" },
      content: "<p>Der Angriff wird ohne Parade abgewickelt.</p>", modal: true, rejectClose: false
    });
    if (!confirmed) return;
    ensure(message, action);
    return postResponse(defender, message, "defense",
      `<p><strong>${escapeHtml(token.name)}</strong> verzichtet auf die Parade.</p>`);
  }
  if (action === "damage") {
    const options = await foundry.applications.api.DialogV2.input({
      window: { title: "Schaden gegen " + token.name }, modal: true, rejectClose: false,
      content: `<div class="form-group"><label for="ucurifunke-damage">Schaden</label>
        <input id="ucurifunke-damage" name="damage" required value="${escapeHtml(attack.damage)}"></div>`,
      ok: { label: "Schaden würfeln" }
    });
    if (!options) return;
    const current = ensure(message, action);
    const formula = damageFormula(options.damage);
    if (!formula) throw new Error("Bitte eine Schadensangabe wie 2W6+4 oder 5 eingeben.");
    const roll = await new foundry.dice.Roll(formula).evaluate();
    ensure(message, action);
    const protection = armorProtection(current.defender);
    const total = Math.max(0, roll.total - protection);
    return postResponse(attacker, message, "damage", `<article class="ucurifunke-check-card">
      <header>Schaden gegen <strong>${escapeHtml(token.name)}</strong></header>
      <div>${escapeHtml(options.damage)} · Trefferpunkte: <strong>${roll.total}</strong></div>
      <div>Rüstungsschutz: <strong>${protection}</strong></div>
      <footer><strong>Schadenspunkte: ${total}</strong></footer></article>`, [roll]);
  }

  const checks = [
    ...defender.items.filter(item => item.type === "weapon").map(item => weaponCheck(defender, item, "PA")),
    ...defender.system.skills.filter(skill => skill.group === "Nahkampf").map(skill =>
      techniqueCheck(defender, skill, "PA", techniqueSettings(defender, skill)))
  ].filter(Boolean);
  if (!checks.length) throw new Error("Für diesen Charakter ist keine Parade hinterlegt.");
  const choices = checks.map((check, index) => `<option value="${index}">${escapeHtml(check.weapon ?? check.technique ?? check.attackName)}
    · ${check.ticks ?? 4} Ticks</option>`).join("");
  const selection = getSelection(game, canvas);
  const canBook = selection.token?.document?.uuid === token.uuid;
  const options = await prepareRoll({ kind: "combat", name: "Parade gegen Angriff auf " + token.name },
    `<div class="form-group"><label for="ucurifunke-parry">Waffe oder Kampftechnik</label>
      <select id="ucurifunke-parry" name="parry">${choices}</select></div>
      ${canBook ? '<label><input type="checkbox" name="bookParry" checked> Tickkosten im laufenden Kampf buchen</label>' : ""}`, { allowBlind: false });
  if (!options) return;
  ensure(message, action);
  const check = checks[Number(options.fields.parry)];
  if (!check) throw new Error("Bitte eine Parade auswählen.");
  const adjusted = applyConditionEffects(defender, check);
  const book = canBook && [true, 1, "1", "true", "on"].includes(options.fields.bookParry);
  const ticks = check.ticks ?? 4;
  if (book && (ticks < 0 || ticks > 32)) throw new Error("Ungültige Tickkosten für diese Parade.");
  if (book) assertSameSelection(selection, getSelection(game, canvas));
  const response = await postRoll(defender, { ...adjusted, targetName: token.name,
    exchange: { type: "defense", attack: message.id } },
    { ...options, mode: "public" });
  if (book && response) {
    await addActionTicks(selection, ticks, { game, canvas });
    await response.update({ content: response.content.replace("</footer>", `</footer><p>Gebuchte Ticks: <strong>${ticks}</strong></p>`) });
  }
  return response;
}

function addActions(message, html) {
  const card = html.querySelector(".ucurifunke-check-card");
  if (!card) return;
  card.querySelector(".ucurifunke-exchange")?.remove();
  const state = canRespond(message);
  if (!state) return;
  const choices = [["parry", "Parade würfeln"], ["dodge", "Ausweichen"], ["skip", "Auf Abwehr verzichten"], ["damage", "Schaden würfeln"]]
    .filter(([action]) => allowed(state, action));
  if (!choices.length && !state.defense) return;
  const group = document.createElement("div");
  group.className = "ucurifunke-exchange";
  if (state.defense) {
    const status = document.createElement("p");
    status.textContent = state.damage ? "Schaden abgewickelt." : state.defense.success ? "Angriff abgewehrt." : "Treffer.";
    group.append(status);
  }
  for (const [action, label] of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = pending.has(message.id);
    button.addEventListener("click", async () => {
      if (pending.has(message.id)) return;
      pending.add(message.id);
      addActions(message, html);
      try { await respond(message, action); }
      catch (error) { ui.notifications.warn(error.message); }
      finally {
        pending.delete(message.id);
        addActions(message, html);
      }
    });
    group.append(button);
  }
  card.append(group);
}

export function renderExchange(message, html) {
  if (exchangeData(message)?.type === "attack") addActions(message, html);
}

export function refreshExchange(message) {
  const id = exchangeData(message)?.attack;
  const attack = id && game.messages.get(id);
  if (!attack) return;
  for (const html of document.querySelectorAll("[data-message-id]")) {
    if (html.dataset.messageId === id) addActions(attack, html);
  }
}
