import { automationAuthority, registerAutomation, requestAutomation, updateActorOnce, serializeAutomation } from "./automation-queue.js";
import { validateEffect, effectClock, tokenEffects, expiredEffect, modifiedValue } from "./effect-rules.js";
import { resourceValue, resourceChange } from "./resource-updates.js";
import { forwardPartDamage } from "./segments.js";
import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml as esc } from "./check-card.js";
import { normalizeTicks } from "./tick/data.js";
import { getTimelineApp } from "./tick/state.js";

let maintenance = Promise.resolve();
function sceneCombat(token) { return game.combats.find(combat => combat.scene?.id === token.parent?.id && combat.active) ?? null; }
const scheduled = new Set();
const bool = value => [true, "true", "on", 1, "1"].includes(value);

registerAutomation("effectApply", async request => {
  const { document: token, payload, user } = request;
  if (token.documentName !== "Token" || !token.actor || token.actor.type === "object") throw new Error("Bitte einen Akteur mit Spielwerten wählen.");
  const template = await fromUuid(payload.sourceUuid);
  if (template?.documentName !== "Item" || template.type !== "effect" || !user.isGM && !template.testUserPermission(user, "LIMITED")) throw new Error("Die Effektvorlage ist nicht zugänglich.");
  const allowed = Object.fromEntries(["recurring", "interval", "duration", "permanent"].filter(key => key in (payload.options ?? {})).map(key => [key, payload.options[key]]));
  const definition = validateEffect({ ...template.system.toObject(), ...allowed });
  for (const change of definition.changes) {
    if (change.target === "actionTicks" ? token.actor.type === "bodypart" : !Number.isFinite(readTarget(token.actor, change.target)))
      throw new Error(`${token.name} verfügt nicht über den Zielwert ${change.target}.`);
  }
  const combat = sceneCombat(token);
  const now = effectClock(combat);
  const effect = request.plan ?? await request.savePlan({ ...definition, id: foundry.utils.randomID(), sourceUuid: template.uuid, name: template.name,
    combatId: combat?.id ?? null, startedAt: now, expiresAt: definition.permanent ? null : now + definition.duration,
    nextAt: now + definition.interval });
  if (tokenEffects(token).some(entry => entry.id === effect.id)) return effect.id;
  const existing = tokenEffects(token).filter(entry => definition.stackable || entry.sourceUuid !== template.uuid);
  await token.setFlag("ucurifunke", "effects", [...existing, effect]);
  return effect.id;
});

registerAutomation("effectRemove", async ({ document: token, payload }) => {
  await token.setFlag("ucurifunke", "effects", tokenEffects(token).filter(effect => effect.id !== payload.id));
});

function readTarget(actor, target) {
  if (["LE", "AE", "KE"].includes(target)) return resourceValue(actor, target)?.value;
  if (target.startsWith("max.")) return resourceValue(actor, target.slice(4))?.max;
  if (target === "impairment") return actor.system.impairment;
  const [kind, key] = target.split(".");
  if (kind === "attribute" && key === "RE") return actor.system.reaction;
  return actor.system[kind === "attribute" ? "attributes" : "derived"]?.find(row => row.key.toLowerCase() === key.toLowerCase())?.value;
}

function pulsePatch(actor, deltas, label) {
  const data = structuredClone(actor.system.toObject?.() ?? actor.system);
  const patch = {};
  const temporary = { type: actor.type, name: actor.name, system: data };
  for (const { target, delta } of deltas) {
    if (["LE", "AE", "KE"].includes(target)) {
      const change = resourceChange(temporary, target, delta, label);
      for (const [key, value] of Object.entries(change)) { patch[key] = value; foundry.utils.setProperty(temporary, key, value); }
    } else if (target.startsWith("max.")) {
      const key = target.slice(4), current = resourceValue(temporary, key);
      if (!current) continue;
      if (actor.type === "bodypart") {
        data.health.max = Math.max(1, current.max + delta); data.health.value = Math.min(data.health.value, data.health.max);
        patch["system.health"] = data.health;
      } else {
        data.energies = data.energies.map(row => row.key === key ? { ...row, max: Math.max(0, current.max + delta), value: Math.min(row.value, Math.max(0, current.max + delta)) } : row);
        patch["system.energies"] = data.energies;
      }
    } else if (target === "impairment") patch["system.impairment"] = Math.max(0, data.impairment + delta);
    else {
      const [kind, key] = target.split(".");
      if (kind === "attribute" && key === "RE") patch["system.reaction"] = Math.max(0, data.reaction + delta);
      else {
        const field = kind === "attribute" ? "attributes" : "derived";
        patch["system." + field] = data[field].map(row => row.key.toLowerCase() === key.toLowerCase() ? { ...row, value: row.value + delta } : row);
        data[field] = patch["system." + field];
      }
    }
  }
  return patch;
}

registerAutomation("effectTrigger", async request => {
  const { document: token, payload } = request;
  const effect = tokenEffects(token).find(entry => entry.id === payload.id);
  if (!effect) return;
  const combat = game.combats.get(effect.combatId);
  if (!combat?.started || effect.kind !== "periodic" || effect.nextAt > effectClock(combat)) throw new Error("Der Effekt ist noch nicht fällig.");
  if (payload.expectedNextAt !== effect.nextAt) return;
  let plan = request.plan;
  if (!plan) {
    const deltas = [...new Set(effect.changes.map(row => row.target))].map(target => {
      const value = readTarget(token.actor, target);
      if (!Number.isFinite(value)) throw new Error(`${token.name} verfügt nicht über den Zielwert ${target}.`);
      return { target, delta: modifiedValue(value, effect.changes.filter(row => row.target === target)) - value };
    });
    const patch = pulsePatch(token.actor, deltas, effect.name);
    const after = patch["system.health.value"] ?? patch["system.health"]?.value ?? token.actor.system.health?.value;
    plan = await request.savePlan({ deltas, nextAt: effect.nextAt + effect.interval,
      loss: token.actor.type === "bodypart" ? Math.max(0, token.actor.system.health.value - after) : 0 });
  }
  await updateActorOnce(token.actor, request.id, pulsePatch(token.actor, plan.deltas, effect.name));
  if (plan.loss) await forwardPartDamage(token, plan.loss, request.id);
  const keep = effect.recurring && (effect.permanent || effectClock(combat) < effect.expiresAt);
  await token.setFlag("ucurifunke", "effects", tokenEffects(token).flatMap(entry => entry.id !== effect.id ? [entry] : keep ? [{ ...entry, nextAt: plan.nextAt }] : []));
  await normalizeTicks(combat);
});

export async function applyEffectTemplate(token, item) {
  if (!token?.actor?.isOwner || item?.type !== "effect") return;
  const source = validateEffect(item.system.toObject());
  const result = await foundry.applications.api.DialogV2.input({ classes: SYSTEM_DIALOG_CLASSES,
    window: { title: `${item.name} · ${token.name}` }, modal: true, rejectClose: false,
    content: `<div class="uq-effect-application">
      <p>${esc(source.description)}</p><p>${source.kind === "continuous" ? "Durchgängige Wirkung · rechte Effektspalte" : "Manuelle Auslösung · Zeitleiste"}</p>
      ${source.kind === "periodic" ? `<label>Wiederkehrend<input type="checkbox" name="recurring" ${source.recurring ? "checked" : ""}></label><label>Intervall in Ticks<input type="number" name="interval" min="1" max="1000000" step="1" value="${source.interval}" required></label>` : ""}
      <label>Permanent<input type="checkbox" name="permanent" ${source.permanent ? "checked" : ""}></label>
      <label>Dauer in Ticks<input type="number" name="duration" min="1" max="1000000" step="1" value="${source.duration}" required></label>
      </div>`, ok: { label: "Anwenden" }
  });
  if (!result) return;
  await requestAutomation("effectApply", token.uuid, { sourceUuid: item.uuid, options: {
    recurring: source.kind === "periodic" && bool(result.recurring), interval: source.kind === "periodic" ? Number(result.interval) : source.interval,
    duration: Number(result.duration), permanent: bool(result.permanent)
  } });
}

export function dropEffectOnActor(actor, data, explicit) {
  if (data.type !== "Item") return false;
  void (async () => {
    const item = await foundry.documents.Item.fromDropData(data);
    if (item?.type !== "effect") return;
    const { effectToken } = await import("./effect-values.js");
    const token = effectToken(actor, explicit);
    if (!token) throw new Error("Bitte genau einen Token dieses Akteurs auf der aktuellen Szene auswählen.");
    await applyEffectTemplate(token, item);
  })().catch(error => ui.notifications.error(error.message));
}

export async function manageTokenEffects(token) {
  if (!token?.isOwner) return;
  const effects = tokenEffects(token);
  const content = `<div><p>Effektvorlagen aus dem Kompendium „Ucurifunke · Effekte“ auf diesen Token oder seinen Bogen ziehen. Eigene Vorlagen lassen sich im Gegenstandsverzeichnis mit dem Typ „Effektvorlage“ erstellen.</p>
    ${effects.map(effect => `<label class="uq-segment-choice"><input type="checkbox" name="${effect.id}">${esc(effect.name)} · ${effect.permanent ? "Permanent" : Math.max(0, effect.combatId ? effect.expiresAt - effectClock(game.combats.get(effect.combatId)) : effect.duration) + " Ticks"}${effect.combatId ? "" : " · wartet auf einen Kampf"}</label>`).join("") || "<p>Keine aktiven Effekte.</p>"}</div>`;
  const ids = await foundry.applications.api.DialogV2.prompt({ classes: SYSTEM_DIALOG_CLASSES, position: {width:540},
    window: {title:"Effekte · " + token.name}, content, modal:true, rejectClose:false,
    ok: {label:"Markierte Effekte entfernen", callback:(_event, button) => [...button.form.querySelectorAll("input:checked")].map(input => input.name)} });
  if (Array.isArray(ids)) for (const id of ids) await requestAutomation("effectRemove", token.uuid, {id});
}

Hooks.on("renderTokenHUD", (hud, html) => {
  if (!hud.document?.isOwner || !hud.actor || hud.actor.type === "object") return;
  const button = document.createElement("button");button.type="button";button.className="control-icon uq-token-effects";
  button.dataset.tooltipText=button.ariaLabel="Effekte verwalten";
  button.innerHTML='<i class="fa-solid fa-wand-magic-sparkles" inert></i>';
  button.onclick=event=>{event.preventDefault();event.stopPropagation();void manageTokenEffects(hud.document).catch(error=>ui.notifications.error(error.message));};
  html.querySelector(".col.right")?.append(button);
});

export function scheduleEffectMaintenance(combat) {
  if (!automationAuthority() || !combat || scheduled.has(combat.id)) return;
  scheduled.add(combat.id);
  let checkedAt;
  maintenance = maintenance.catch(console.error).then(() => serializeAutomation(async () => {
    if (!game.combats.has(combat.id)) return;
    const now = effectClock(combat);
    checkedAt = now;
    for (const token of combat.scene?.tokens ?? []) {
      const effects = tokenEffects(token);
      const next = effects.flatMap(effect => {
        if (!effect.combatId && combat.active) return [{ ...effect, combatId: combat.id, startedAt: now, expiresAt: effect.permanent ? null : now + effect.duration, nextAt: now + (effect.remainingDelay ?? effect.interval) }];
        return effect.combatId === combat.id && expiredEffect(effect, now) ? [] : [effect];
      });
      if (JSON.stringify(next) !== JSON.stringify(effects)) await token.setFlag("ucurifunke", "effects", next);
    }
  })).finally(() => {
    scheduled.delete(combat.id);
    if (game.combats.has(combat.id) && checkedAt !== effectClock(combat)) scheduleEffectMaintenance(combat);
  });
}

function refreshEffectViews() {
  const timeline = getTimelineApp();
  if (timeline?.rendered) void timeline.render();
  for (const app of Object.values(foundry.applications.api.ApplicationV2.instances)) {
    if (app.rendered && app.element?.classList.contains("ucurifunke-sheet")) void app.render();
  }
}

Hooks.on("dropCanvasData", (_canvas, data) => {
  if (data.type !== "Item") return;
  void (async () => {
    const item = await foundry.documents.Item.fromDropData(data);
    if (item?.type !== "effect") return;
    const candidates = canvas.tokens.placeables.filter(token => token.bounds.contains(data.x, data.y) && token.actor?.isOwner);
    const target = candidates.sort((a, b) => b.document.sort - a.document.sort)[0];
    if (!target) throw new Error("Den Effekt bitte auf einen eigenen Token ziehen.");
    await applyEffectTemplate(target.document, item);
  })().catch(error => ui.notifications.error(error.message));
});
Hooks.on("updateToken", (_token, changes) => { if (changes.flags?.ucurifunke?.effects || changes.delta) refreshEffectViews(); });
Hooks.on("updateCombat", combat => { scheduleEffectMaintenance(combat); refreshEffectViews(); });
Hooks.on("createCombat", scheduleEffectMaintenance);
Hooks.on("deleteCombat", combat => {
  if (!automationAuthority()) return;
  maintenance = maintenance.catch(console.error).then(() => serializeAutomation(async () => {
    for (const token of combat.scene?.tokens ?? []) {
      const effects = tokenEffects(token);
      const next = effects.flatMap(effect => {
        if (effect.combatId !== combat.id) return [effect];
        const remaining = effect.permanent ? effect.duration : Math.max(0, effect.expiresAt - effectClock(combat));
        return !effect.permanent && !remaining ? [] : [{ ...effect, combatId: null, duration: remaining, expiresAt: null,
          remainingDelay: Math.max(0, effect.nextAt - effectClock(combat)) }];
      });
      if (JSON.stringify(next) !== JSON.stringify(effects)) await token.setFlag("ucurifunke", "effects", next);
    }
  }));
});
Hooks.once("ready", () => { for (const combat of game.combats) scheduleEffectMaintenance(combat); });
