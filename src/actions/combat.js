import * as tickApi from "../tick/data.js";

export const MODULE_ID = "ucurifunke-quick-combat-actions";
export const SETTINGS_SCOPE = "ucurifunke";
export const OWNERSHIP_ERROR = "Keine Berechtigung für diesen Akteur.";

// Token identity matters: multiple tokens can share the same actor.
export function getSelection(game, canvas) {
  if (!game.user) return { error: OWNERSHIP_ERROR };
  const combat = game.combat;
  if (!combat?.started) return { error: "Kein laufender Kampf ausgewählt." };
  if (!canvas?.ready || !canvas.scene) return { error: "Keine Szene aktiv." };
  const selected = canvas.tokens?.controlled ?? [];
  if (selected.length !== 1) return { error: "Genau ein Token auswählen." };
  const token = selected[0];
  if (!game.user.isGM && !token.document?.isOwner) return { error: OWNERSHIP_ERROR };
  const sceneId = token.document?.parent?.id ?? canvas.scene.id;
  const combatants = [...(combat.combatants ?? [])].filter(candidate =>
    candidate.tokenId === token.id && (candidate.sceneId ?? combat.scene?.id) === sceneId
  );
  if (combatants.length !== 1) return { error: "Der ausgewählte Token muss eindeutig zur Turnorder dieses Kampfes gehören." };
  return { combat, combatant: combatants[0], token, sceneId };
}

export function assertSameSelection(expected, current) {
  if (current.error) throw new Error(current.error);
  if (current.combat !== expected.combat || current.combatant.id !== expected.combatant.id
    || current.token.id !== expected.token.id || current.sceneId !== expected.sceneId) {
    throw new Error("Kampf oder Tokenauswahl wurde geändert. Bitte die Handlung erneut wählen.");
  }
}

export async function addActionTicks(expected, ticks, { game, canvas, loadApi = () => tickApi }) {
  if (!Number.isInteger(ticks) || ticks < 0 || ticks > 32) throw new Error("Ungültige Tickkosten.");
  assertSameSelection(expected, getSelection(game, canvas));
  const api = await loadApi();
  // Recheck permissions and identity before persisting.
  assertSameSelection(expected, getSelection(game, canvas));
  if (ticks === 0) return;
  await api.queueActionTicks(expected.combatant, ticks);
}
