import { openAppearanceSettings } from "./appearance.js";

const { api, sheets } = foundry.applications;

export class ObjectSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ucurifunke-sheet", "ucurifunke-object-sheet"],
    tag: "form", position: { width: 510, height: 560 }, window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { appearance: () => openAppearanceSettings() }
  };

  static PARTS = { object: { template: "systems/ucurifunke/templates/object.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, data: this.actor.system, actorName: this.actor.name, actorImage: this.actor.img,
      sheetId: this.id, canEdit: this.isEditable };
  }

  _onDropItem() { return false; }
  _onDropActiveEffect() { return false; }
}
