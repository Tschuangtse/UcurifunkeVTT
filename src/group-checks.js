import { effectiveActor } from "./effect-values.js";
import { evaluateCheck, prepareRoll } from "./checks.js";
import { escapeHtml } from "./check-card.js";
import { applyConditionEffects } from "./conditions.js";
import { attributeCheck, perceptionAttributes, perceptionCheck, skillCheck } from "./sheet-view.js";
import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { techniqueFlag } from "./technique-check.js";

const probes = {
  perception: { title: "Wahrnehmung", icon: "fa-solid fa-eye" },
  kmr: { title: "Körperliche Magieresistenz", icon: "fa-solid fa-shield-halved" },
  gmr: { title: "Geistige Magieresistenz", icon: "fa-solid fa-brain" },
  shared: { title: "Gemeinsame Fähigkeit suchen", icon: "fa-solid fa-magnifying-glass" }
};

export function passesGroupThreshold(quality, threshold) {
  return threshold === 0 ? quality >= 0 : quality > threshold;
}

export function groupCheck(actor, type) {
  actor = effectiveActor(actor);
  const data = actor?.system;
  if (!data?.attributes || !data.derived) return null;
  if (type === "perception") {
    const check = perceptionCheck(data);
    return check && actor.type === "retinue" ? { kind: "attribute", name: check.name, value: check.value } : check;
  }
  if (type !== "kmr" && type !== "gmr") return null;
  return attributeCheck(data.attributes, data.attributes.findIndex(row => row.key.toLowerCase() === type));
}

function rollableSkills(actor) {
  actor = effectiveActor(actor);
  const skills = actor?.system?.skills ?? [];
  const checks = new Map();
  const ambiguous = new Set();
  for (const [index, skill] of skills.entries()) {
    let check = skillCheck(skills, index);
    if (skill.rollable && (actor.type === "retinue" || actor.system.npcGenerator)) {
      const keys = actor.getFlag?.("ucurifunke", "companionAbilityAttributes")?.[techniqueFlag(skill)]
        ?? skill.attributes.map(row => row.key);
      const primary = perceptionAttributes(actor.system.attributes);
      const attributes = keys.map(key => primary.find(row => row.key.toUpperCase() === key?.toUpperCase()));
      check = attributes.length === 3 && attributes.every(Boolean) && (!actor.system.npcGenerator || new Set(attributes).size > 1)
        ? { ...skill, attributes, kind: "skill" } : null;
    }
    if (!check || !Number.isFinite(check.value)) continue;
    const key = JSON.stringify([skill.group, skill.name].map(value => value.trim().normalize("NFC").toLocaleLowerCase("de")));
    if (checks.has(key)) ambiguous.add(key);
    checks.set(key, { label: skill.name, group: skill.group, check });
  }
  for (const key of ambiguous) checks.delete(key);
  return checks;
}

export function sharedGroupSkills(actors) {
  if (!actors.length) return [];
  const [first, ...others] = actors.map(rollableSkills);
  return [...first].flatMap(([key, entry]) => others.every(skills => skills.has(key))
    ? [{ key, label: entry.label, group: entry.group, checks: [entry.check, ...others.map(skills => skills.get(key).check)] }]
    : []).sort((a, b) => a.label.localeCompare(b.label, "de") || a.group.localeCompare(b.group, "de"));
}

async function chooseGroupSkill(skills) {
  const options = skills.map(({ label, group }, index) => `<option value="${index}">${escapeHtml(label + " · " + group)}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.input({
    classes: SYSTEM_DIALOG_CLASSES, window: { title: "Gemeinsame Fähigkeit wählen" }, position: { width: 480 },
    content: `<div class="ucurifunke-group-skill-picker">
      <label>Fähigkeit suchen<input type="search" name="search" autofocus></label>
      <label>Fähigkeit<select name="skill" size="8" required>${options}</select></label>
      <p data-no-match hidden>Keine passende Fähigkeit.</p></div>`,
    modal: true, rejectClose: false, ok: { label: "Weiter" },
    render: (_event, dialog) => {
      const search = dialog.element.querySelector('[name="search"]');
      const select = dialog.element.querySelector('[name="skill"]');
      const entries = [...select.options];
      const filter = () => {
        const terms = search.value.toLocaleLowerCase("de").trim().split(/\s+/u);
        const previouslySelected = select.value;
        const matches = entries.filter(entry => terms.every(term => entry.textContent.toLocaleLowerCase("de").includes(term)));
        select.replaceChildren(...matches);
        select.value = matches.some(entry => entry.value === previouslySelected) ? previouslySelected : matches[0]?.value ?? "";
        dialog.element.querySelector("[data-no-match]").hidden = Boolean(matches.length);
        dialog.element.querySelector('button[data-action="ok"]').disabled = !matches.length;
      };
      search.addEventListener("input", filter);
      filter();
    }
  });
  return result ? skills[Number(result.skill)] : null;
}

let running = false;
async function rollGroup(type) {
  if (!game.user.isGM || running) return;
  const tokens = [...canvas.tokens.controlled].filter(token => type === "shared" || groupCheck(effectiveActor(token.actor, token.document), type));
  if (!tokens.length) {
    ui.notifications.warn("Kein ausgewählter Token hat einen passenden Probenwert.");
    return;
  }
  running = true;
  try {
    let chosen;
    if (type === "shared") {
      const common = sharedGroupSkills(tokens.map(token => effectiveActor(token.actor, token.document)));
      if (!common.length) {
        ui.notifications.warn("Die ausgewählten Token haben keine gemeinsame würfelbare Fähigkeit.");
        return;
      }
      chosen = await chooseGroupSkill(common);
      if (!chosen) return;
    }
    const title = chosen?.label ?? probes[type].title;
    const options = await prepareRoll({ name: "Gruppenprobe: " + title },
      '<div class="form-group"><label for="ucurifunke-group-threshold">Qualitätsschwelle</label>' +
      '<input id="ucurifunke-group-threshold" type="number" name="threshold" min="0" step="1" value="0" required></div>',
      { allowBlind: false });
    if (!options || !game.user.isGM) return;
    const threshold = Number(options.fields.threshold);
    if (!Number.isSafeInteger(threshold) || threshold < 0) return;
    const rows = [];
    for (const [index, token] of tokens.entries()) {
      const check = chosen ? chosen.checks[index] : groupCheck(effectiveActor(token.actor, token.document), type);
      if (!check || token.destroyed) continue;
      let adjusted;
      try { adjusted = applyConditionEffects(effectiveActor(token.actor, token.document), check); }
      catch (error) {
        rows.push([token.name, "—", error.message]);
        continue;
      }
      const roll = await new foundry.dice.Roll("3d20").evaluate();
      const dice = roll.dice[0].results.map(die => die.result);
      const { quality } = evaluateCheck(adjusted, dice, options.bonus - options.penalty);
      rows.push([token.name, quality, passesGroupThreshold(quality, threshold)]);
    }
    if (!rows.length) return;
    const ChatMessage = foundry.documents.ChatMessage;
    // Only the summary is sent. Dice results are kept local to the GM's browser.
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
      whisper: [game.user.id],
      content: `<article class="ucurifunke-check-card"><header>Verdeckte Gruppenprobe · <strong>${escapeHtml(title)}</strong> · Schwelle ${threshold}</header>
        <table class="ucurifunke-group-results"><thead><tr><th>Name</th><th><abbr title="Qualität">Qual.</abbr></th><th>Bestanden?</th></tr></thead>
        <tbody>${rows.map(([name, quality, result]) => {
          const label = typeof result === "string" ? result : result ? "Bestanden" : "Nicht bestanden";
          const icon = typeof result === "string" ? "circle-minus" : result ? "check" : "xmark";
          const state = typeof result === "string" ? "blocked" : result ? "passed" : "failed";
          return `<tr><td>${escapeHtml(name)}</td><td>${quality}</td><td>
            <span class="ucurifunke-group-result ${state}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
              <i class="fa-solid fa-${icon}" aria-hidden="true"></i>
            </span></td></tr>`;
        }).join("")}</tbody></table></article>`
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
