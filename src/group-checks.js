import { evaluateCheck, prepareRoll } from "./checks.js";
import { escapeHtml } from "./check-card.js";
import { applyConditionEffects } from "./conditions.js";
import { attributeCheck, perceptionCheck } from "./sheet-view.js";

const probes = {
  perception: { title: "Wahrnehmung", icon: "fa-solid fa-eye" },
  kmr: { title: "Körperliche Magieresistenz", icon: "fa-solid fa-shield-halved" },
  gmr: { title: "Geistige Magieresistenz", icon: "fa-solid fa-brain" }
};

export function passesGroupThreshold(quality, threshold) {
  return threshold === 0 ? quality >= 0 : quality > threshold;
}

export function groupCheck(actor, type) {
  const data = actor?.system;
  if (!data?.attributes || !data.derived) return null;
  if (type === "perception") {
    const check = perceptionCheck(data);
    return check && actor.type === "retinue" ? { kind: "attribute", name: check.name, value: check.value } : check;
  }
  if (type !== "kmr" && type !== "gmr") return null;
  return attributeCheck(data.attributes, data.attributes.findIndex(row => row.key.toLowerCase() === type));
}

let running = false;
async function rollGroup(type) {
  if (!game.user.isGM || running) return;
  const tokens = canvas.tokens.controlled.filter(token => groupCheck(token.actor, type));
  if (!tokens.length) {
    ui.notifications.warn("Kein ausgewählter Token hat einen passenden Probenwert.");
    return;
  }
  running = true;
  try {
    const title = probes[type].title;
    const options = await prepareRoll({ name: "Gruppenprobe: " + title },
      '<div class="form-group"><label for="ucurifunke-group-threshold">Qualitätsschwelle</label>' +
      '<input id="ucurifunke-group-threshold" type="number" name="threshold" min="0" step="1" value="0" required></div>',
      { allowBlind: false });
    if (!options || !game.user.isGM) return;
    const threshold = Number(options.fields.threshold);
    if (!Number.isSafeInteger(threshold) || threshold < 0) return;
    const rows = [];
    for (const token of tokens) {
      const check = groupCheck(token.actor, type);
      if (!check || token.destroyed) continue;
      let adjusted;
      try { adjusted = applyConditionEffects(token.actor, check); }
      catch (error) {
        rows.push([token.name, "—", error.message]);
        continue;
      }
      const roll = await new foundry.dice.Roll("3d20").evaluate();
      const dice = roll.dice[0].results.map(die => die.result);
      const { quality } = evaluateCheck(adjusted, dice, options.bonus - options.penalty);
      rows.push([token.name, quality, passesGroupThreshold(quality, threshold) ? "Bestanden" : "Nicht bestanden"]);
    }
    if (!rows.length) return;
    const ChatMessage = foundry.documents.ChatMessage;
    // Only the summary is sent. Dice results are kept local to the GM's browser.
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
      whisper: [game.user.id],
      content: `<article class="ucurifunke-check-card"><header>Verdeckte Gruppenprobe · <strong>${title}</strong></header>
        <table><thead><tr><th>Name</th><th>Qualität</th><th>Ergebnis</th></tr></thead>
        <tbody>${rows.map(row => "<tr>" + row.map(value => "<td>" + escapeHtml(String(value)) + "</td>").join("") + "</tr>").join("")}</tbody></table></article>`
    });
  } catch (error) { ui.notifications.error(error.message); }
  finally { running = false; }
}

export function registerGroupControls(controls) {
  if (!game.user.isGM) return;
  const name = "ucurifunkeGroupChecks";
  const order = Math.max(-1, ...Object.values(controls).map(control => control.order)) + 1;
  controls[name] = {
    name, order, title: "Verdeckte Gruppenproben", icon: "fa-solid fa-user-secret", activeTool: "perception",
    tools: Object.fromEntries(Object.entries(probes).map(([id, probe], order) => [id, {
      name: id, order, ...probe, button: true
    }]))
  };
}

export function bindGroupControls(app, html) {
  if (!game.user.isGM) return;
  for (const id of Object.keys(probes)) {
    html.querySelector(`button[data-tool="${id}"]`)?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void rollGroup(id);
    }, { capture: true });
  }
}
