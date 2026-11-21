import { applyEffectTemplate } from "./effects.js";
import { effectToken } from "./effect-values.js";
import { openAppearanceSettings } from "./appearance.js";
const { api, sheets } = foundry.applications;
export class BodyPartSheet extends api.HandlebarsApplicationMixin(sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = { classes: ["ucurifunke-sheet", "ucurifunke-object-sheet", "uq-bodypart-sheet"], tag: "form",
    position: { width: 480, height: 320 }, window: { resizable: true }, form: { submitOnChange: true, closeOnSubmit: false },
    actions: { appearance: () => openAppearanceSettings() } };
  static PARTS = { main: { template: "systems/ucurifunke/templates/bodypart.hbs" } };
  async _prepareContext(options) {
    return { ...await super._prepareContext(options), rootId: this.id, name: this.actor.name, img: this.actor.img, health: this.actor.system.health,
      editable: this.isEditable, parentName: this.actor.token?.parent?.tokens.get(this.actor.token.getFlag("ucurifunke", "segment")?.mainId)?.name };
  }
  _onDropItem(_event, item) { return item.type === "effect" ? applyEffectTemplate(effectToken(this.actor, this.token), item) : false; }
  _onDropActiveEffect() { return false; }
  _processFormData(event,form,formData) {
    const data=super._processFormData(event,form,formData),health=data.system?.health;
    // DocumentSheet validates before Actor.update can queue the linked change.
    // Clamp here as well so reducing a maximum remains a valid form submission.
    if(health&&Number.isFinite(health.value)&&Number.isFinite(health.max))health.value=Math.min(health.value,health.max);
    return data;
  }
}

Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== "bodypart") return;
  actor.updateSource({ "prototypeToken.actorLink": false, "prototypeToken.bar1.attribute": "health", "prototypeToken.bar2.attribute": null,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
    ...(!data.img ? { img: "icons/svg/wing.svg", "prototypeToken.texture.src": "icons/svg/wing.svg" } : {}) });
});
Hooks.on("preCreateToken", token => {
  if (token.actor?.type === "bodypart") token.updateSource({ actorLink: false, "bar1.attribute": "health", "bar2.attribute": null, displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS });
});
