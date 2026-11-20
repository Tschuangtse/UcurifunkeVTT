import { applyDesign, currentDesign, registerDesign } from "./appearance.js";
import { bindGroupControls, registerGroupControls } from "./group-checks.js";
import "./tick/main.js";
import "./actions/main.js";
import "./creation-defaults.js";
import "./dice-menu.js";
import "./campaign.js";
import "./token-status.js";
import "./token-light.js";
import "./object-tokens.js";
import "./token-footprint.js";
import { UcurifunkeActor } from "./actor.js";
import { CharacterData, EquipmentData, ObjectData, WeaponData } from "./models.js";
import { ObjectSheet } from "./object-sheet.js";
import { CharacterSheet, CompanionSheet, importPedipalpus } from "./actor-sheet.js";
import { renderHiddenCheck } from "./checks.js";
import { registerCheckCommands } from "./chat-commands.js";
import { refreshExchange, renderExchange } from "./combat-workflow.js";
import { importNpcGroup } from "./npc-bulk-import.js";
import { createProbeMacro, rollSavedProbe } from "./probe-shortcuts.js";

Hooks.once("ready", () => {
  applyDesign(currentDesign());
  game.ucurifunke = { ...game.ucurifunke, rollSavedProbe };
});
Hooks.on("hotbarDrop", (_bar, data, slot) => {
  if (data?.type !== "UcurifunkeProbe") return;
  void createProbeMacro(data, slot).catch(error => ui.notifications.error(error.message));
  return false;
});

Hooks.on("getSceneControlButtons", registerGroupControls);
Hooks.on("getSceneControlButtons", controls => {
  const name = "ucurifunkeAvesmaps";
  const title = "Avesmaps öffnen";
  const icon = "fa-solid fa-map";
  const order = Math.max(-1, ...Object.values(controls).map(control => control.order)) + 1;
  controls[name] = { name, title, icon, order,
    tools: { openMap: { name: "openMap", title, icon, order: 0, button: true } } };
});
Hooks.on("renderSceneControls", (_app, html) => {
  html.querySelector('button[data-control="ucurifunkeAvesmaps"]')?.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    window.open("https://avesmaps.de/", "_blank", "noopener,noreferrer");
  }, { capture: true });
});
Hooks.on("renderSceneControls", bindGroupControls);
Hooks.on("renderChatMessageHTML", renderHiddenCheck);
Hooks.on("renderChatMessageHTML", renderExchange);
Hooks.on("createChatMessage", refreshExchange);
Hooks.on("deleteChatMessage", refreshExchange);

Hooks.once("init", () => {
  registerDesign();
  game.settings.register("ucurifunke", "rollSounds", { name: "Würfelklänge", scope: "client", config: true,
    type: Boolean, default: true });
  registerCheckCommands(foundry.applications.sidebar.tabs.ChatLog.CHAT_COMMANDS);
  CONFIG.Actor.documentClass = UcurifunkeActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = CharacterData;
  CONFIG.Actor.dataModels.retinue = CharacterData;
  CONFIG.Actor.dataModels.object = ObjectData;
  CONFIG.Actor.trackableAttributes ??= {};
  CONFIG.Actor.trackableAttributes.object = { bar: ["structure"], value: [] };
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, CharacterSheet, { types: ["character", "npc"], makeDefault: true }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, CompanionSheet, { types: ["retinue"], makeDefault: true, label: "Gefolge" }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, ObjectSheet, { types: ["object"], makeDefault: true, label: "Gegenstand" }
  );
});


Hooks.on("renderActorDirectory", (_directory, html) => {
  if (!(html instanceof HTMLElement) || !game.user.can("ACTOR_CREATE")) return;
  const header = html.querySelector(".directory-header, .directory-controls, .header-actions");
  if (!header || header.querySelector(".ucurifunke-import")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ucurifunke-import";
  button.innerHTML = '<i class="fa-solid fa-file-import" aria-hidden="true"></i> Pedipalpus importieren';
  button.addEventListener("click", importPedipalpus);
  header.append(button);
  if (game.user.isGM) {
    const bulk = document.createElement("button");
    bulk.type = "button";
    bulk.className = "ucurifunke-import";
    bulk.innerHTML = '<i class="fa-solid fa-file-import" aria-hidden="true"></i> NSC Massenimport';
    bulk.addEventListener("click", importNpcGroup);
    header.append(bulk);
  }
});
