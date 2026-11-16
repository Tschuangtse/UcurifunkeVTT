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

export function mundaneTabsEnabled() {
  return Boolean(game.user.getFlag("ucurifunke", "mundaneTabs"));
}

export async function openAppearanceSettings(actor) {
  const settings = game.settings;
  const design = currentDesign();
  const sounds = settings.get("ucurifunke", "rollSounds");
  const tabs = actor?.type !== "retinue" && actor?.isOwner ? actor : null;
  const checkbox = (name, label, checked) => `<label class="form-group"><span>${label}</span>
    <input type="checkbox" name="${name}" ${checked ? "checked" : ""}></label>`;
  try {
    const result = await foundry.applications.api.DialogV2.input({
      classes: SYSTEM_DIALOG_CLASSES,
      window: { title: "Bogendesign und Würfelklänge" },
      content: `<div class="form-group"><label for="ucurifunke-design">Bogendesign</label>
        <select id="ucurifunke-design" name="design">${Object.entries(SHEET_DESIGNS).map(([key, label]) =>
          `<option value="${key}" ${key === design ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="form-group"><label for="ucurifunke-sounds">Würfelklänge beim eigenen Wurf</label>
        <input id="ucurifunke-sounds" type="checkbox" name="sounds" ${sounds ? "checked" : ""}></div>
        ${checkbox("mundaneTabs", "Unterreiter für mundane Fertigkeiten", mundaneTabsEnabled())}
        ${tabs ? checkbox("showMagic", "Magie anzeigen", tabs.getFlag("ucurifunke", "showMagic") !== false)
          + checkbox("showClerical", "Klerikal anzeigen", tabs.getFlag("ucurifunke", "showClerical") !== false) : ""}`,
      rejectClose: false, modal: true, ok: { label: "Speichern" },
      render: (_event, dialog) => {
        dialog.element.querySelector('[name="design"]').addEventListener("change", event => applyDesign(event.target.value));
      }
    });
    if (!result) return;
    const checked = value => [true, 1, "1", "true", "on"].includes(value);
    if (Object.hasOwn(SHEET_DESIGNS, result.design)) await game.user.setFlag("ucurifunke", "appearanceDesign", result.design);
    await settings.set("ucurifunke", "rollSounds", checked(result.sounds));
    await game.user.setFlag("ucurifunke", "mundaneTabs", checked(result.mundaneTabs));
    if (tabs?.isOwner) await tabs.update({
      "flags.ucurifunke.showMagic": checked(result.showMagic),
      "flags.ucurifunke.showClerical": checked(result.showClerical)
    });
    for (const app of Object.values(foundry.applications.api.ApplicationV2.instances)) {
      if (app.rendered && app.element?.classList.contains("ucurifunke-sheet")) void app.render();
    }
  } finally {
    applyDesign(currentDesign());
  }
}
