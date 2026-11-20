let outline;
export function clearEffectHighlight() {
  if (outline && !outline.destroyed) outline.destroy();
  outline = null;
}
export function bindEffectHighlights(element) {
  clearEffectHighlight();
  for (const row of element.querySelectorAll("[data-effect-token-id]")) {
    row.addEventListener("mouseenter", () => {
      clearEffectHighlight();
      const token = globalThis.canvas?.tokens?.get(row.dataset.effectTokenId);
      if (!token?.isVisible || token.destroyed) return;
      outline = token.addChild(new PIXI.Graphics());
      outline.name = "ucurifunke-effect-highlight";
      outline.eventMode = "none";
      outline.lineStyle(5, 0x91ddff, 1).drawRoundedRect(-5, -5, token.w + 10, token.h + 10, 10);
    });
    row.addEventListener("mouseleave", clearEffectHighlight);
  }
}
