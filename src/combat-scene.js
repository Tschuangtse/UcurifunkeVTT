// V14's native Token HUD can create scene-less encounters. Recover their
// scene from the participants instead of depending on the GM's viewed canvas.
export function encounterSceneId(combat) {
  if (combat?.scene?.id) return combat.scene.id;
  const ids = new Set([...(combat?.combatants ?? [])].map(entry => entry.sceneId ?? entry.token?.parent?.id).filter(Boolean));
  return ids.size === 1 ? [...ids][0] : null;
}

export function combatForToken(token, combats = globalThis.game?.combats ?? []) {
  return [...combats].filter(combat => combat.active && encounterSceneId(combat) === token?.parent?.id)
    .sort((a,b) => Number(b.started) - Number(a.started) || a.id.localeCompare(b.id))[0] ?? null;
}

export function tokensForCombat(combat) {
  return combat?.scene?.tokens ?? globalThis.game?.scenes?.get?.(encounterSceneId(combat))?.tokens ?? [];
}
