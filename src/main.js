import "./tick/main.js";
import "./actions/main.js";
import "./creation-defaults.js";
import "./dice-menu.js";
import { UcurifunkeActor } from "./actor.js";
import { CharacterData, EquipmentData, WeaponData } from "./models.js";
import { CharacterSheet, CompanionSheet, importPedipalpus } from "./actor-sheet.js";
import { renderHiddenCheck } from "./checks.js";
import { registerCheckCommands } from "./chat-commands.js";
import { refreshExchange, renderExchange } from "./combat-workflow.js";

Hooks.on("renderChatMessageHTML", renderHiddenCheck);
Hooks.on("renderChatMessageHTML", renderExchange);
Hooks.on("createChatMessage", refreshExchange);
Hooks.on("deleteChatMessage", refreshExchange);

Hooks.once("init", () => {
  registerCheckCommands(foundry.applications.sidebar.tabs.ChatLog.CHAT_COMMANDS);
  CONFIG.Actor.documentClass = UcurifunkeActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = CharacterData;
  CONFIG.Actor.dataModels.retinue = CharacterData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, CharacterSheet, { types: ["character", "npc"], makeDefault: true }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, CompanionSheet, { types: ["retinue"], makeDefault: true, label: "Gefolge" }
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
});
