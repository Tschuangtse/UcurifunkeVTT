import test from "node:test";
import assert from "node:assert/strict";
import { validateEffect, modifiedValue, expiredEffect, activeTokenEffects } from "../src/effect-rules.js";
import { applyContinuousValues, actionTickCost, effectiveActor } from "../src/effect-values.js";
import { partHealthPlan, segmentPosition } from "../src/segment-rules.js";
import { weaponCheck, dodgeCheck } from "../src/checks.js";
import { perceptionCheck, skillCheck } from "../src/sheet-view.js";
import { groupCheck } from "../src/group-checks.js";

const definition = { kind: "periodic", interval: 20, duration: 60, recurring: true, permanent: false, changes: [{target:"LE",mode:"add",value:4}] };
test("effect definitions reject impossible timings, targets, and non-finite arithmetic", () => {
  assert.equal(validateEffect(definition).changes[0].value, 4);
  for (const patch of [{interval:0},{duration:19},{kind:"unknown"},{changes:[]},{changes:[{target:"LE",mode:"add",value:NaN}]},
    {kind:"continuous"}, {changes:[{target:"actionTicks",mode:"add",value:2}]}]) assert.throws(() => validateEffect({...definition,...patch}));
});
test("tick modifiers combine all flat changes before additive percentages and round up once", () => {
  const changes = [{mode:"add",value:2},{mode:"add",value:-1},{mode:"percent",value:25},{mode:"percent",value:10}];
  assert.equal(modifiedValue(4, changes, {ticks:true}), 7);
  assert.equal(modifiedValue(4, [{mode:"percent",value:-150}], {ticks:true}), 0);
});
test("a pulse due at expiry remains pending until explicitly triggered; continuous effects expire", () => {
  const periodic = {...definition,combatId:"c",nextAt:60,expiresAt:60};
  assert.equal(expiredEffect(periodic,60),false);
  assert.equal(expiredEffect(periodic,100),false);
  assert.equal(expiredEffect({...periodic,nextAt:80},60),true);
  assert.equal(expiredEffect({...periodic,kind:"continuous"},60),true);
  assert.equal(expiredEffect({...periodic,permanent:true},9999999),false);
  assert.equal(activeTokenEffects({getFlag:()=>[periodic]},{id:"other"}).length,0);
});
test("body-part damage transfers only actual lost LE, and healing does not transfer", () => {
  assert.deepEqual(partHealthPlan({value:8,max:20},{delta:-100}),{value:0,max:20,loss:8});
  assert.deepEqual(partHealthPlan({value:8,max:20},{delta:100}),{value:20,max:20,loss:0});
  assert.deepEqual(partHealthPlan({value:8,max:20},{max:5}),{value:5,max:5,loss:3});
  for(const patch of [{value:NaN},{delta:1.5},{max:0}]) assert.throws(()=>partHealthPlan({value:8,max:20},patch));
});
test("group movements preserve independently positioned parts and transform elevation and rotation", () => {
  assert.deepEqual(segmentPosition({x:150,y:200,rotation:10,elevation:3},{x:100,y:100,rotation:0,elevation:1},{x:200,y:300,rotation:0,elevation:4}),{x:250,y:400,rotation:10,elevation:6});
  const rotated=segmentPosition({x:200,y:100},{x:100,y:100},{x:100,y:100,rotation:90});
  assert.ok(Math.abs(rotated.x-100)<1e-9);assert.ok(Math.abs(rotated.y-200)<1e-9);
});
test("continuous modifiers update sheet values and skill attribute snapshots without mutating source data", () => {
  const source={attributes:[{key:"KL",value:14}],skills:[{attributes:[{key:"KL",value:14}]}],derived:[{key:"WA",value:8}],reaction:2,impairment:1};
  const result=applyContinuousValues(source,[{target:"attribute.KL",mode:"add",value:3},{target:"derived.WA",mode:"percent",value:50}]);
  assert.equal(result.attributes[0].value,17);assert.equal(result.skills[0].attributes[0].value,17);assert.equal(result.derived[0].value,12);assert.equal(source.attributes[0].value,14);
});
test("token-scoped modifiers reach weapon, dodge, perception and group checks without leaking to another instance", () => {
  const attributes=["MU","KL","IN","CH","FF","GE","KO","KK"].map(key=>({key,name:key,value:14}));
  const actor={id:"a",system:{attributes,skills:[],derived:[{key:"OFF",value:10},{key:"DEF",value:8},{key:"WA",value:6}],reaction:2,impairment:0},getFlag:()=>null};
  const changes=[{target:"derived.OFF",mode:"add",value:3},{target:"derived.DEF",mode:"add",value:2},{target:"derived.WA",mode:"add",value:4},{target:"attribute.KL",mode:"add",value:1},{target:"actionTicks",mode:"percent",value:25}];
  const token={documentName:"Token",actor,parent:{id:"scene"},getFlag:()=>[{kind:"continuous",permanent:true,changes}]};
  globalThis.canvas={tokens:{controlled:[{actor,document:token}],placeables:[]}};
  globalThis.game={combats:[]};
  assert.equal(actionTickCost(7,token),9);
  const weapon={id:"w",name:"Sword",system:{attack:18,parry:12,preparedCheck:true,speed:8}};
  assert.equal(weaponCheck(actor,weapon,"AT").value,21);
  assert.equal(dodgeCheck(actor).value,12);
  assert.equal(perceptionCheck(effectiveActor(actor).system).value,10);
  assert.equal(groupCheck(actor,"perception").attributes[0].value,15);
  const other={documentName:"Token",getFlag:()=>[],parent:{id:"scene"}};
  assert.equal(effectiveActor(actor,other).system.derived[0].value,10);
  assert.equal(actor.system.derived[0].value,10);
  delete globalThis.canvas;delete globalThis.game;
});
