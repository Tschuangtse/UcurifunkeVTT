import { SETTINGS_SCOPE } from "./combat.js";
import { ActionDock } from "./dock.js";

let dock;
let scheduled = false;
function refresh() {
  if (!dock || scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; dock.refresh(); });
}

Hooks.once("init", () => {
  game.settings.register(SETTINGS_SCOPE, "enabled", {
    name: "Kampfhandlungen anzeigen", hint: "Kompakte Handlungsleiste anzeigen.",
    scope: "client", config: true, type: Boolean, default: true, onChange: refresh
  });
  game.settings.register(SETTINGS_SCOPE, "bottomOffset", {
    name: "Abstand zum unteren Bildschirmrand", hint: "Abstand in Pixeln; 80 lässt Platz für die Makroleiste.",
    scope: "client", config: true, type: Number, default: 80, range: { min: 0, max: 400, step: 1 }, onChange: refresh
  });
});

Hooks.once("ready", () => {
  dock = new ActionDock();
  dock.refresh();
});

for (const hook of ["controlToken", "canvasReady", "canvasTearDown", "createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant", "updateToken", "deleteToken", "updateActor", "updateUser", "renderCombatTracker"]) {
  Hooks.on(hook, refresh);
}
