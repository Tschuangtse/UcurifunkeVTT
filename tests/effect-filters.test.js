import test from "node:test";
import assert from "node:assert/strict";
import { validateEffect } from "../src/effect-rules.js";
import { matchesCheckFilter, matchesActionFilter, CHECK_CATEGORIES, ACTION_FILTERS } from "../src/effect-filters.js";
import { actionTickCost, applyCheckEffects } from "../src/effect-values.js";
import { encounterSceneId, combatForToken } from "../src/combat-scene.js";
import { effectEntries } from "../src/effect-timeline.js";
import { renderCheckCard } from "../src/check-card.js";
import { segmentPosition } from "../src/segment-rules.js";

const choice=(type,value)=>({filterType:type,filterValue:value});
test("scene-less native V14 encounters are inferred from participants, never from the authority's viewed scene",()=>{
  const token={parent:{id:"test"}};
  const combat={id:"c",active:true,combatants:[{sceneId:"test"}]};
  assert.equal(encounterSceneId(combat),"test");assert.equal(combatForToken(token,[combat]),combat);
  assert.equal(combatForToken({parent:{id:"other"}},[combat]),null);
  assert.equal(encounterSceneId({...combat,combatants:[{sceneId:"test"},{sceneId:"other"}]}),null);
});
test("periodic and continuous instances appear in a scene-less native encounter before and after combat starts",()=>{
  const effects=[{id:"p",name:"Regeneration",kind:"periodic",combatId:"c",permanent:true,nextAt:20,changes:[]},{id:"s",name:"Slow",kind:"continuous",combatId:"c",permanent:true,nextAt:20,changes:[]}];
  const token={id:"t",name:"Hero",uuid:"Scene.s.Token.t",actor:{visible:true},isOwner:true,getFlag:()=>effects};
  globalThis.game={user:{isGM:true},scenes:new Map([["s",{tokens:[token]}]])};
  const combat={id:"c",active:true,started:false,combatants:[{sceneId:"s"}],getFlag:()=>0};
  assert.equal(effectEntries(combat).length,1);assert.equal(effectEntries(combat,{continuous:true}).length,1);
  combat.started=true;assert.equal(effectEntries(combat)[0].ticks,20);
  delete globalThis.game;
});
test("check filters distinguish physical skills, mental attributes, magic, divine abilities and exact skill names",()=>{
  const body={kind:"skill",group:"Körper",name:"Kraftakt",sourceName:"Athletik – Kraftakt",attributes:[{key:"GE"},{key:"KO"},{key:"KK"}]};
  assert.equal(matchesCheckFilter(choice("checkCategory","physical"),body),true);
  assert.equal(matchesCheckFilter(choice("checkCategory","mental"),body),false);
  assert.equal(matchesCheckFilter(choice("checkCategory","physical"),{kind:"attribute",key:"KK"}),true);
  assert.equal(matchesCheckFilter(choice("checkCategory","physical"),{kind:"attribute",key:"KL"}),false);
  assert.equal(matchesCheckFilter(choice("skillGroup","Körper"),body),true);
  assert.equal(matchesCheckFilter(choice("skillName","Athletik – Kraftakt"),body),true);
  assert.equal(matchesCheckFilter(choice("attribute","KK"),body),true);
  assert.equal(matchesCheckFilter(choice("attribute","MU"),body),false);
  for(const [group,category] of [["Zauber","magic"],["Rituale","magic"],["Wunder","divine"]])assert.equal(matchesCheckFilter(choice("checkCategory",category),{kind:"skill",group}),true);
});
test("every action belongs to exactly one of the four categories; named actions and movement filters do not leak",()=>{
  for(const [id]of ACTION_FILTERS){const matches=["offensive","defensive","movement","tactical"].filter(category=>matchesActionFilter(choice("actionCategory",category),id));assert.equal(matches.length,1,id);}
  assert.equal(matchesActionFilter(choice("actionCategory","movement"),"run"),true);
  assert.equal(matchesActionFilter(choice("actionCategory","movement"),"melee"),false);
  assert.equal(matchesActionFilter(choice("actionId","dodge"),"parry"),false);
});
test("effect validation preserves filters and rejects incompatible or unknown selections",()=>{
  const source={kind:"continuous",interval:20,duration:60,permanent:true,changes:[{target:"checkPenalty",mode:"add",value:2,...choice("checkCategory","physical")}]};
  assert.equal(validateEffect(source).changes[0].filterValue,"physical");
  for(const filter of [choice("actionCategory","movement"),choice("checkCategory","unknown"),choice("skillName","")]) assert.throws(()=>validateEffect({...source,changes:[{...source.changes[0],...filter}]}));
  for(const [key]of CHECK_CATEGORIES) assert.doesNotThrow(()=>validateEffect({...source,changes:[{...source.changes[0],...choice("checkCategory",key)}]}));
});
test("filtered check modifiers combine once and movement modifiers alter only movement costs",()=>{
  const changes=[{target:"checkPenalty",mode:"add",value:2,...choice("checkCategory","physical")},{target:"checkBonus",mode:"add",value:1,...choice("skillGroup","Körper")},{target:"actionTicks",mode:"add",value:-1,...choice("actionCategory","movement")}];
  const token={documentName:"Token",parent:{id:"s"},getFlag:()=>[{name:"Test",kind:"continuous",permanent:true,changes}]};
  const actor={_uqToken:token,system:{skills:[],attributes:[]}};
  const check={name:"Kraftakt",kind:"skill",group:"Körper",value:8};
  const adjusted=applyCheckEffects(actor,check);assert.equal(adjusted.value,7);assert.equal(applyCheckEffects(actor,adjusted).value,7);
  assert.equal(applyCheckEffects(actor,{kind:"attribute",key:"KL",value:14}).value,14);
  assert.equal(actionTickCost(4,token,"run"),3);assert.equal(actionTickCost(4,token,"parry"),4);
});

test("percentage penalties cannot improve negative check values and chat breakdowns retain the unmodified base",()=>{
  const token={documentName:"Token",getFlag:()=>[{name:"Malus",kind:"continuous",permanent:true,changes:[{target:"checkPenalty",mode:"percent",value:25}]}]};
  const actor={_uqToken:token,system:{}};
  assert.equal(applyCheckEffects(actor,{kind:"combat",value:-8}).value,-10);
  const card=renderCheckCard({kind:"combat",mode:"AT",name:"Sword",value:16,effectModifiers:[{name:"Malus",value:-2}]},[5],{bonus:0,penalty:0},{quality:11,success:true});
  assert.match(card,/Basiswert inkl\. Waffe<\/dt><dd>\+18/);
  assert.match(card,/Effekt: Malus<\/dt><dd>-2/);
});

test("unequal token sizes rotate around the main token's center",()=>{
  const result=segmentPosition({x:200,y:100,pixelWidth:100,pixelHeight:100},{x:100,y:100,rotation:0,pixelWidth:200,pixelHeight:200},{x:100,y:100,rotation:90,pixelWidth:200,pixelHeight:200});
  assert.ok(Math.abs(result.x-200)<1e-9);assert.ok(Math.abs(result.y-200)<1e-9);
});

test("imported chat commands can match full skill names and attribute filters without changing their explicit dice values",()=>{
  const changes=[{target:"checkPenalty",mode:"add",value:2,...choice("skillName","Athletik – Kraftakt")},{target:"checkBonus",mode:"add",value:1,...choice("attribute","KK")}];
  const token={documentName:"Token",getFlag:()=>[{name:"Test",kind:"continuous",permanent:true,changes}]};
  const actor={_uqToken:token,system:{skills:[{name:"Athletik – Kraftakt",group:"Körper",attributes:[{key:"GE"},{key:"KO"},{key:"KK"}]}],attributes:[]}};
  const check={name:"Kraftakt",kind:"skill",value:8,attributes:[{value:14},{value:15},{value:16}]};
  const result=applyCheckEffects(actor,check);assert.equal(result.value,7);assert.deepEqual(result.attributes,check.attributes);
});
