export function objectTokenDefaults() {
  return { "bar1.attribute": "structure", "bar2.attribute": null, displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS };
}

export function refreshObjectBar(token) {
  if (token.destroyed || token.actor?.type !== "object") return;
  const bar = token.bars?.bar1;
  if (bar) bar.visible = token.document.bar1.attribute === "structure" && token.actor.system.structure.value < 3;
}

Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== "object") return;
  actor.updateSource(Object.fromEntries(Object.entries(objectTokenDefaults()).map(([key, value]) => ["prototypeToken." + key, value])));
  if (!data.img) {
    const artwork = { img: "icons/svg/item-bag.svg" };
    if (!data.prototypeToken?.texture?.src && !data["prototypeToken.texture.src"]) {
      artwork["prototypeToken.texture.src"] = artwork.img;
    }
    actor.updateSource(artwork);
  }
});
Hooks.on("preCreateToken", token => {
  if (token.actor?.type === "object") token.updateSource(objectTokenDefaults());
});
Hooks.on("drawToken", refreshObjectBar);
Hooks.on("refreshToken", refreshObjectBar);
Hooks.on("preCreateCombatant", combatant => {
  if (combatant.actor?.type !== "object") return;
  ui.notifications.warn("Gegenstände können keine Kampfhandlungen durchführen.");
  return false;
});
Hooks.on("preCreateActiveEffect", effect => {
  if (effect.parent?.documentName === "Actor" && effect.parent.type === "object") return false;
});
Hooks.on("preCreateItem", item => {
  if (item.parent?.type === "object") return false;
});
