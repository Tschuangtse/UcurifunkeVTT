import { activeTokenEffects, modifiedValue } from "./effect-rules.js";
import { combatForToken } from "./combat-scene.js";
import { matchesCheckFilter, matchesActionFilter } from "./effect-filters.js";

export function effectToken(actor, explicit) {
  if (explicit?.documentName === "Token") return explicit;
  if (explicit?.document?.documentName === "Token") return explicit.document;
  if (actor?.isToken && actor.token) return actor.token;
  const controlled = globalThis.canvas?.tokens?.controlled?.filter(token => token.actor?.id === actor?.id) ?? [];
  if (controlled.length === 1) return controlled[0].document;
  const tokens = globalThis.canvas?.tokens?.placeables?.filter(token => token.actor?.id === actor?.id) ?? [];
  return tokens.length === 1 ? tokens[0].document : null;
}

export function continuousChanges(token) {
  const combat = globalThis.game?.combats?.get?.(token?.parent?.id && tokenEffectsCombat(token))
    ?? combatForToken(token);
  return activeTokenEffects(token, combat).filter(effect => effect.kind === "continuous").flatMap(effect => effect.changes.map(change=>({...change,effectName:effect.name})));
}
function tokenEffectsCombat(token) { return token?.getFlag?.("ucurifunke", "effects")?.find(effect => effect.combatId)?.combatId; }

export function applyContinuousValues(system, changes) {
  if (!changes.length) return system;
  const data = globalThis.structuredClone ? structuredClone(system.toObject?.() ?? system) : JSON.parse(JSON.stringify(system));
  const value = (target, base) => modifiedValue(base, changes.filter(change => change.target.toLowerCase() === target.toLowerCase()));
  for (const row of data.attributes ?? []) row.value = value("attribute." + row.key, row.value);
  for (const skill of data.skills ?? []) for (const row of skill.attributes ?? []) row.value = value("attribute." + row.key, row.value);
  for (const row of data.derived ?? []) row.value = value("derived." + row.key, row.value);
  for (const row of data.energies ?? []) row.max = Math.max(0, value("max." + row.key, row.max ?? data.derived?.find(d => d.key === row.key)?.value ?? 0));
  if (data.health) data.health.max = Math.max(1, value("max.LE", data.health.max));
  if (data.reaction != null) data.reaction = value("attribute.RE", data.reaction);
  if (data.impairment != null) data.impairment = Math.max(0, value("impairment", data.impairment));
  return data;
}

export function effectiveActor(actor, explicit) {
  if (!actor || actor._uqEffective) return actor;
  const changes = continuousChanges(effectToken(actor, explicit));
  if (!changes.length) return actor;
  const system = applyContinuousValues(actor.system, changes);
  return new Proxy(actor, { get(target, key) {
    if (key === "system") return system;
    if (key === "_uqEffective") return true;
    if (key === "_uqOriginal") return target;
    if (key === "_uqToken") return effectToken(target, explicit);
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

export function actionTickCost(base, token, actionId) {
  return modifiedValue(base, continuousChanges(token?.document ?? token).filter(change => change.target === "actionTicks" && matchesActionFilter(change,actionId)), { ticks: true });
}

export function applyCheckEffects(actor, check) {
  if (!actor || check._uqCheckEffects) return check;
  let context=check;
  if(!check.group) {
    const skill=actor.system.skills?.find(row=>row.name===check.name||row.rollName===check.name||row.name.endsWith(" – "+check.name));
    const attribute=actor.system.attributes?.find(row=>row.name===check.name);
    context={...check,group:skill?.group,sourceName:check.sourceName??skill?.name,key:check.key??attribute?.key,
      ...(check.attributes?{attributes:check.attributes.map((row,index)=>({...row,key:row.key??actor.system.attributes?.find(attribute=>attribute.name===row.name)?.key??skill?.attributes?.[index]?.key}))}:{})};
  }
  const changes=continuousChanges(actor._uqToken??effectToken(actor)).filter(change=>["checkPenalty","checkBonus"].includes(change.target)&&matchesCheckFilter(change,context));
  if(!changes.length)return check;
  const signed=changes.map(change=>({...change,value:change.value*(change.target==="checkPenalty"?-1:1)}));
  const flat=check.value+signed.filter(change=>change.mode==="add").reduce((sum,change)=>sum+change.value,0);
  const value=Math.round(flat+Math.abs(flat)*signed.filter(change=>change.mode==="percent").reduce((sum,change)=>sum+change.value,0)/100);
  return {...check,value,_uqCheckEffects:true,effectModifiers:[{name:[...new Set(changes.map(change=>change.effectName))].join(" · "),value:value-check.value}]};
}
