export const SYSTEM_DIALOG_CLASSES = ["ucurifunke-dialog"];

export const SHEET_DESIGNS = {
  standard: "Standard", parchment: "Pergament", steel: "Stahl",
  tavern: "Holz und Papier", "white-marble": "Weißer Marmor", "black-marble": "Schwarzer Marmor",
  leather: "Leder", necromancer: "Nekromant", demonologist: "Dämonologe", divine: "Gottgesandt"
};

export function applyDesign(design) {
  document.documentElement.dataset.ucurifunkeDesign = Object.hasOwn(SHEET_DESIGNS, design) ? design : "standard";
}

export function registerDesign() {
  game.settings.register("ucurifunke", "sheetDesign", { name: "Bogendesign", scope: "user", config: false,
    type: String, choices: SHEET_DESIGNS, default: "standard" });
  class AppearanceMenu extends foundry.applications.api.DialogV2 {
    constructor() { super({ buttons: [{ action: "close", label: "Schließen" }] }); }
    render() { return openAppearanceSettings(); }
  }
  game.settings.registerMenu("ucurifunke", "appearance", {
    name: "Bogendesign und Würfelklänge", label: "Darstellung öffnen", icon: "fa-solid fa-palette",
    type: AppearanceMenu, restricted: false
  });
}

export function currentDesign() {
  return game.user.getFlag("ucurifunke", "appearanceDesign") ?? game.settings.get("ucurifunke", "sheetDesign");
}

export async function openAppearanceSettings() {
  const settings = game.settings;
  const design = currentDesign();
  const sounds = settings.get("ucurifunke", "rollSounds");
  try {
    const result = await foundry.applications.api.DialogV2.input({
      classes: SYSTEM_DIALOG_CLASSES,
      window: { title: "Bogendesign und Würfelklänge" },
      content: `<div class="form-group"><label for="ucurifunke-design">Bogendesign</label>
        <select id="ucurifunke-design" name="design">${Object.entries(SHEET_DESIGNS).map(([key, label]) =>
          `<option value="${key}" ${key === design ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="form-group"><label for="ucurifunke-sounds">Würfelklänge beim eigenen Wurf</label>
        <input id="ucurifunke-sounds" type="checkbox" name="sounds" ${sounds ? "checked" : ""}></div>`,
      rejectClose: false, modal: true, ok: { label: "Speichern" },
      render: (_event, dialog) => {
        dialog.element.querySelector('[name="design"]').addEventListener("change", event => applyDesign(event.target.value));
      }
    });
    if (!result) return;
    if (Object.hasOwn(SHEET_DESIGNS, result.design)) await game.user.setFlag("ucurifunke", "appearanceDesign", result.design);
    await settings.set("ucurifunke", "rollSounds", [true, 1, "1", "true", "on"].includes(result.sounds));
  } finally {
    applyDesign(currentDesign());
  }
}
