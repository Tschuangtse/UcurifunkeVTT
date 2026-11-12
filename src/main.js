import "./tick/main.js";
import "./actions/main.js";
import "./creation-defaults.js";
import "./dice-menu.js";
import { UcurifunkeActor } from "./actor.js";
import { CharacterData, EquipmentData, WeaponData } from "./models.js";
import { CharacterSheet, importPedipalpus } from "./actor-sheet.js";
import { renderHiddenCheck } from "./checks.js";

Hooks.on("renderChatMessageHTML", renderHiddenCheck);

Hooks.once("init", () => {
  CONFIG.Actor.documentClass = UcurifunkeActor;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = CharacterData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor, game.system.id, CharacterSheet, { types: ["character", "npc"], makeDefault: true }
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
