import { activeTokenEffects, effectClock, remainingDuration } from "./effect-rules.js";
import { tokensForCombat } from "./combat-scene.js";

export function effectEntries(combat, { continuous = false, forDisplay = true } = {}) {
  const now = effectClock(combat);
  const tokens = tokensForCombat(combat);
  return [...tokens].flatMap(token => {
    if (!token.actor || forDisplay && !game.user?.isGM && (token.hidden || !token.actor.visible)) return [];
    return activeTokenEffects(token, combat).filter(effect => effect.combatId === combat.id && (effect.kind === "continuous") === continuous)
      .map(effect => ({ id: `effect:${token.id}:${effect.id}`, effectId: effect.id, tokenId: token.id, tokenUuid: token.uuid,
        name: `${effect.name} (${token.name})`, effectName:effect.name, actorName:token.name,
        isEvent: true, isEffect: true, continuous, isHidden: token.hidden,
        ticks: Math.max(0, (!effect.permanent && effect.nextAt > effect.expiresAt ? effect.expiresAt : effect.nextAt) - now),
        isWaiting: !effect.permanent && effect.nextAt > effect.expiresAt,
        repeating: effect.recurring, ffwd: effect.interval, nextAt: effect.nextAt,
        remaining: remainingDuration(effect, now), permanent: effect.permanent,
        canTrigger: Boolean(combat.started && effect.nextAt <= now && (effect.permanent || effect.nextAt <= effect.expiresAt) && (game.user.isGM || token.isOwner)),
        canRemove: game.user.isGM || token.isOwner, notes: effect.description }));
  });
}
