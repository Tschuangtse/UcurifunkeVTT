import { automationAuthority, registerAutomation, requestAutomation, updateActorOnce } from "./automation-queue.js";
import { resourceChange } from "./resource-updates.js";
import { partHealthPlan, segmentPosition } from "./segment-rules.js";
import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml as esc } from "./check-card.js";

const scope = "ucurifunke";
let work = Promise.resolve();
const enqueue = fn => { work = work.catch(console.error).then(fn).catch(error => console.error("Ucurifunke segments", error)); return work; };
const anchor = token => ({ x: token.x, y: token.y, rotation: token.rotation, elevation: token.elevation });

registerAutomation("partHealth", async request => {
  const token = request.document;
  if (token.documentName !== "Token" || token.actor?.type !== "bodypart") throw new Error("Kein Körperteil ausgewählt.");
  const plan = request.plan ?? await request.savePlan(partHealthPlan(token.actor.system.health, request.payload));
  await updateActorOnce(token.actor, request.id, { "system.health": { value: plan.value, max: plan.max } });
  if (plan.loss) await forwardPartDamage(token, plan.loss, request.id);
  return true;
});

export async function forwardPartDamage(token, loss, receipt) {
  const link = token.getFlag(scope, "segment");
  if (!link) return;
  const main = token.parent.tokens.get(link.mainId);
  if (!main?.actor || main.getFlag(scope, "segmentGroup")?.id !== link.groupId) throw new Error("Das Haupttoken dieser Gruppe ist nicht mehr vorhanden.");
  await updateActorOnce(main.actor, receipt + "main", resourceChange(main.actor, "LE", -loss, "Körperteil: " + token.name));
}

async function ensureGroup(main) {
  if (!automationAuthority() || !main.actor || ["bodypart", "object"].includes(main.actor.type)) return;
  const template = main.actor.getFlag(scope, "segmentTemplate");
  if (!template?.parts?.length || main.getFlag(scope, "segment")) return;
  let group = main.getFlag(scope, "segmentGroup");
  if (!group) {
    group = { id: foundry.utils.randomID(), anchor: anchor(main), parts: template.parts.map(part => ({ ...part, id: foundry.utils.randomID() })) };
    await main.setFlag(scope, "segmentGroup", group);
  }
  const size = main.parent.grid.size;
  const missing = group.parts.filter(part => !main.parent.tokens.has(part.id));
  if (!group.initialized && missing.length) {
    const docs = [];
    for (const part of missing) {
      const actor = game.actors.get(part.actorId);
      if (actor?.type !== "bodypart") continue;
      docs.push({ ...part.token, _id: part.id, actorId: actor.id, actorLink: false,
        x: main.x + part.dx * size, y: main.y + part.dy * size, elevation: main.elevation + (part.de ?? 0),
        delta: { system: { health: { value: part.max, max: part.max } } },
        flags: { ...part.token.flags, [scope]: { ...part.token.flags?.[scope], segment: { mainId: main.id, groupId: group.id, key: part.key } } } });
    }
    if (docs.length) await main.parent.createEmbeddedDocuments("Token", docs, { keepId: true, uqSegmentSpawn: true });
  }
  if (!group.initialized) await main.setFlag(scope, "segmentGroup", { ...group, initialized: true });
}

async function moveGroup(main, movedTogether = new Set()) {
  if (!automationAuthority()) return;
  let group = main.getFlag(scope, "segmentGroup");
  if (!group) return;
  // Persist absolute destinations before moving. Retrying after disconnection
  // then repeats the same coordinates rather than adding a translation twice.
  let plan = main.getFlag(scope, "segmentMovePlan");
  if (!plan) {
    const to = anchor(main);
    if (JSON.stringify(to) === JSON.stringify(group.anchor)) return;
    const updates = group.parts.flatMap(part => {
      if (movedTogether.has(part.id)) return [];
      const token = main.parent.tokens.get(part.id);
      return token ? [{ _id: token.id, ...segmentPosition(token, group.anchor, to) }] : [];
    });
    plan = { to, updates };
    await main.setFlag(scope, "segmentMovePlan", plan);
  }
  if (plan.updates.length) await main.parent.updateEmbeddedDocuments("Token", plan.updates.filter(row => main.parent.tokens.has(row._id)), { uqSegmentMove: true });
  group = main.getFlag(scope, "segmentGroup");
  await main.update({ [`flags.${scope}.segmentGroup`]: { ...group, anchor: plan.to }, [`flags.${scope}.segmentMovePlan`]: null }, { uqSegmentMove: true });
  if (JSON.stringify(anchor(main)) !== JSON.stringify(plan.to)) await moveGroup(main);
}

async function saveFormation(main, ids) {
  if (!game.user.isGM) return;
  const selected = ids.map(id => main.parent.tokens.get(id)).filter(token => token?.actor?.type === "bodypart");
  for (const token of selected) {
    const belongs = token.actor.getFlag(scope, "segmentTemplateOwner");
    const link = token.getFlag(scope, "segment");
    if (belongs && belongs !== main.actor.id || link && link.mainId !== main.id) throw new Error(`${token.name} gehört bereits zu einer anderen Gruppe.`);
  }
  const mainActor = game.actors.get(main.actorId);
  // Each placement owns its own LE and damage ledger, including repeated
  // placements of the same dragon Actor on the same scene.
  if (selected.length && main.actorLink) await main.update({ actorLink: false });
  const groupId = main.getFlag(scope, "segmentGroup")?.id ?? foundry.utils.randomID();
  const old = main.getFlag(scope, "segmentGroup");
  for (const part of old?.parts ?? []) {
    if (!ids.includes(part.id)) await main.parent.tokens.get(part.id)?.unsetFlag(scope, "segment");
  }
  const records = [];
  for (const token of selected) {
    const belongs = token.actor.getFlag(scope, "segmentTemplateOwner");
    const link = token.getFlag(scope, "segment");
    if (belongs && belongs !== main.actor.id || link && link.mainId !== main.id) throw new Error(`${token.name} gehört bereits zu einer anderen Gruppe.`);
    if (token.actorLink) await token.update({ actorLink: false });
    const base = game.actors.get(token.actorId);
    await base.update({ ownership: main.actor.ownership, [`flags.${scope}.segmentTemplateOwner`]: main.actor.id });
    const key = link?.key ?? foundry.utils.randomID();
    await token.setFlag(scope, "segment", { mainId: main.id, groupId, key });
    const source = token.toObject();
    const allowed = ["name", "texture", "width", "height", "shape", "rotation", "alpha", "disposition", "displayName", "displayBars", "bar1", "bar2", "light", "sight", "ring", "lockRotation", "flags"];
    const snapshot = Object.fromEntries(allowed.map(field => [field, source[field]]));
    snapshot.flags = { ...snapshot.flags, [scope]: { ...snapshot.flags?.[scope] } };
    for (const field of ["segment", "effects", "lastTokenLight", "suspendedTokenLight"]) delete snapshot.flags[scope][field];
    records.push({ id: token.id, key, actorId: base.id, token: snapshot, max: token.actor.system.health.max,
      dx: (token.x - main.x) / main.parent.grid.size, dy: (token.y - main.y) / main.parent.grid.size, de: token.elevation - main.elevation });
  }
  await mainActor.setFlag(scope, "segmentTemplate", { parts: records.map(({ id, ...record }) => record) });
  await main.setFlag(scope, "segmentGroup", { id: groupId, anchor: anchor(main), parts: records, initialized: true });
}

export async function openSegments(main) {
  if (!game.user.isGM || !main.actor || ["bodypart", "object"].includes(main.actor.type)) return;
  const selected = new Set(main.getFlag(scope, "segmentGroup")?.parts.map(part => part.id) ?? []);
  const parts = main.parent.tokens.filter(token => token.actor?.type === "bodypart" && (!token.getFlag(scope, "segment") || token.getFlag(scope, "segment").mainId === main.id));
  const result = await foundry.applications.api.DialogV2.prompt({ classes: SYSTEM_DIALOG_CLASSES,
    window: { title: "Körperteile · " + main.name }, position: { width: 520 }, modal: true, rejectClose: false,
    content: `<div><p>Die Körperteile auf der Szene anordnen, hier auswählen und die Anordnung speichern. Neue Platzierungen des Hauptakteurs übernehmen diese Gruppe. Körperteile lassen sich über „Akteur erstellen → Körperteil“ anlegen.</p>
      ${parts.map(part => `<label class="uq-segment-choice"><input type="checkbox" name="part-${part.id}" ${selected.has(part.id) ? "checked" : ""}>${esc(part.name)} · LE ${part.actor.system.health.value} / ${part.actor.system.health.max}</label>`).join("") || "<p>Noch keine Körperteil-Token auf dieser Szene.</p>"}</div>`,
    ok: { label: "Anordnung speichern", callback: (_event, button) => [...button.form.querySelectorAll('input:checked')].map(input => input.name.slice(5)) }
  });
  if (result) { await saveFormation(main, Array.isArray(result) ? result : []); ui.notifications.info("Token-Gruppe gespeichert."); }
}

Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user.isGM || !hud.actor || ["bodypart", "object"].includes(hud.actor.type)) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "control-icon uq-segments";
  button.dataset.tooltipText = button.ariaLabel = "Körperteile verwalten";
  button.innerHTML = '<i class="fa-solid fa-puzzle-piece" inert></i>';
  button.onclick = event => { event.preventDefault(); event.stopPropagation(); void openSegments(hud.document).catch(error => ui.notifications.error(error.message)); };
  html.querySelector(".col.right")?.append(button);
});
Hooks.on("preCreateToken", (token, _data, options) => {
  if (options.uqSegmentSpawn) return;
  if (token.actor?.getFlag(scope, "segmentTemplate")?.parts?.length) token.updateSource({ actorLink: false });
  token.updateSource({ "flags.ucurifunke.segmentGroup": null, "flags.ucurifunke.segmentMovePlan": null, "flags.ucurifunke.segment": null,
    "flags.ucurifunke.effects": [] });
});
Hooks.on("createToken", (token, options) => { if (!options.uqSegmentSpawn) void enqueue(() => ensureGroup(token)); });
Hooks.on("updateToken", (token, changes, options) => {
  if (!options.uqSegmentMove && ["x", "y", "rotation", "elevation"].some(key => key in changes)) {
    const movedTogether = new Set((options.updates ?? []).filter(row => ["x", "y", "rotation", "elevation"].some(key => key in row)).map(row => row._id));
    void enqueue(() => moveGroup(token, movedTogether));
  }
});
Hooks.on("deleteToken", token => {
  if (!automationAuthority()) return;
  const ids = token.getFlag(scope, "segmentGroup")?.parts.map(part => part.id).filter(id => token.parent.tokens.has(id)) ?? [];
  if (ids.length) void enqueue(() => token.parent.deleteEmbeddedDocuments("Token", ids));
});
Hooks.on("updateActor", (actor, changes) => {
  if (!automationAuthority() || !changes.ownership) return;
  void enqueue(async () => {
    for (const part of actor.getFlag(scope, "segmentTemplate")?.parts ?? []) await game.actors.get(part.actorId)?.update({ ownership: actor.ownership });
  });
});
Hooks.once("ready", () => { if (automationAuthority()) for (const scene of game.scenes) for (const token of scene.tokens) void enqueue(async () => { await ensureGroup(token); await moveGroup(token); }); });
