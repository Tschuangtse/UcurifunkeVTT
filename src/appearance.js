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
  game.settings.register("ucurifunke", "sheetDesign", { name: "Bogendesign", scope: "user", config: true,
    type: String, choices: SHEET_DESIGNS, default: "standard", onChange: applyDesign });
}

export async function openAppearanceSettings() {
  const settings = game.settings;
  const design = settings.get("ucurifunke", "sheetDesign");
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
    await settings.set("ucurifunke", "sheetDesign", result.design);
    await settings.set("ucurifunke", "rollSounds", [true, 1, "1", "true", "on"].includes(result.sounds));
  } finally {
    applyDesign(settings.get("ucurifunke", "sheetDesign"));
  }
}
