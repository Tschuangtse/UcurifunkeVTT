import { getCombatantData } from "./data.js";

// Per-client overlays: never change token ownership, selection, or targeting.
const highlights = new WeakMap();
const suppressedMarkers = new WeakSet();

export function refreshTokenHighlight(token) {
  if (!token || token.destroyed || token.isPreview) return;
  const combat = game.combat;
  const combatant = combat?.combatants?.find(entry =>
    entry.tokenId === token.id && entry.sceneId === token.document.parent?.id);
  const inTickCombat = Boolean(combatant);
  if (token.turnMarker) {
    if (inTickCombat) {
      token.turnMarker.visible = false;
      suppressedMarkers.add(token.turnMarker);
    } else if (suppressedMarkers.has(token.turnMarker)) {
      token.turnMarker.visible = true;
      suppressedMarkers.delete(token.turnMarker);
    }
  }

  const active = inTickCombat && !combatant.hidden && !combatant.isDefeated
    && !token.document.hidden && token.isVisible && getCombatantData(combatant).ticks === 0;
  let highlight = highlights.get(token);
  if (!active) {
    if (highlight && !highlight.destroyed) highlight.visible = false;
    return;
  }
  if (!highlight || highlight.destroyed) {
    highlight = token.addChild(new PIXI.Graphics());
    highlight.eventMode = "none";
    highlights.set(token, highlight);
  }
  highlight.clear();
  highlight.lineStyle(8, 0x000000, 0.65);
  highlight.drawRoundedRect(-4, -4, token.w + 8, token.h + 8, 10);
  highlight.lineStyle(4, 0xffd966, 1);
  highlight.drawRoundedRect(-4, -4, token.w + 8, token.h + 8, 10);
  highlight.visible = true;
}

export function refreshTokenHighlights() {
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) refreshTokenHighlight(token);
}
