import test from "node:test";
import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {on(name, fn) { const rows=hooks.get(name)??[];rows.push(fn);hooks.set(name,rows); }, once() {}};
let nextId=1;
const clone = value => JSON.parse(JSON.stringify(value));
function set(object,path,value) {
  const keys=path.split(".");const last=keys.pop();let node=object;
  for(const key of keys) node=node[key]??= {};
  if(last.startsWith("-=")) delete node[last.slice(2)]; else node[last]=clone(value);
}
class Collection extends Map {
  [Symbol.iterator]() {return this.values();}
  find(fn) {return [...this].find(fn);}
  filter(fn) {return [...this].filter(fn);}
}
const documents=new Map();
globalThis.fromUuid=async uuid=>documents.get(uuid);
globalThis.foundry={utils:{randomID:()=>String(nextId++).padStart(16,"0"),setProperty:set}};
globalThis.ui={notifications:{warn(){},info(){},error(message){throw new Error(message);}}};
function doc(id,data={}) {
  const object={id,uuid:id,flags:{},...data,getFlag(scope,key){return key.split(".").reduce((node,key)=>node?.[key],this.flags[scope]);},
    async update(changes){for(const [key,value]of Object.entries(changes))set(this,key,value);return this;},
    async setFlag(scope,key,value){return this.update({[`flags.${scope}.${key}`]:value});},
    async unsetFlag(scope,key){const parts=key.split('.');const last=parts.pop();return this.update({[`flags.${scope}.${parts.length?parts.join('.')+'.':''}-=${last}`]:null});}};
  documents.set(object.uuid,object);return object;
}
let gm,player,outsider,scene,combat;
function actor(id,type="npc",value=30,max=30) {
  const system=type==="bodypart"?{health:{value,max}}:{energies:[{key:"LE",value,max}],damage:[],attributes:[],derived:[],reaction:0,impairment:0};
  Object.defineProperty(system,'toObject',{value:()=>clone(system)});
  return doc(id,{type,name:id,system,ownership:{default:0,p:3}});
}
function token(id,actor) {
  const token=doc(id,{name:id,actor,actorId:actor.id,documentName:"Token",parent:scene,x:100,y:100,rotation:0,elevation:0,
    canUserModify:user=>user.id==="p"});scene.tokens.set(id,token);return token;
}
function setup() {
  documents.clear();gm=doc("g",{isGM:true});player=doc("p",{isGM:false});outsider=doc("x",{isGM:false});
  const users=new Collection([[gm.id,gm],[player.id,player],[outsider.id,outsider]]);users.activeGM=gm;
  scene={id:"scene",tokens:new Collection(),grid:{size:100}};
  combat=doc("c",{scene,started:true,active:true,combatants:new Collection(),flags:{ucurifunke:{totalTicks:0,tickBaselineEstablished:true}}});
  globalThis.game={user:gm,users,combats:new Collection([[combat.id,combat]]),actors:new Collection(),scenes:[scene]};
  globalThis.canvas={tokens:{controlled:[],placeables:[]}};
}
const {requestAutomation,processAutomation}=await import("../src/automation-queue.js");
await import("../src/effects.js");
const {normalizeTicks,getCombatantData}=await import("../src/tick/data.js");

test("body damage and healing are serialized; overkill is not forwarded and a resumed request cannot double damage", async()=>{
  setup();const main=token("main",actor("dragon", "npc",100,100)),part=token("part",actor("wing","bodypart",12,20));
  await main.setFlag("ucurifunke","segmentGroup",{id:"group"});
  await part.setFlag("ucurifunke","segment",{mainId:main.id,groupId:"group"});
  await Promise.all([requestAutomation("partHealth",part.uuid,{delta:-8}),requestAutomation("partHealth",part.uuid,{delta:-8})]);
  assert.equal(part.actor.system.health.value,0);assert.equal(main.actor.system.energies[0].value,88);
  await requestAutomation("partHealth",part.uuid,{delta:10});assert.equal(part.actor.system.health.value,10);assert.equal(main.actor.system.energies[0].value,88);
  const receipt=part.actor.getFlag("ucurifunke","automationApplied")[0];
  await gm.setFlag("ucurifunke",`automationRequests.${receipt}`,{kind:"partHealth",target:part.uuid,payload:{delta:-8},status:"pending",at:Date.now()});
  await processAutomation();assert.equal(main.actor.system.energies[0].value,88);
});

test("request owners cannot spoof GM authority or inject a persisted damage plan",async()=>{
  setup();const main=token("main",actor("dragon","npc",100,100)),part=token("part",actor("wing","bodypart",10,10));
  await main.setFlag("ucurifunke","segmentGroup",{id:"group"});await part.setFlag("ucurifunke","segment",{mainId:main.id,groupId:"group"});
  const id="SecurityTest0001";
  await player.setFlag("ucurifunke",`automationRequests.${id}`,{kind:"partHealth",target:part.uuid,payload:{delta:-2},status:"pending",at:1,user:{isGM:true},plan:{value:0,max:10,loss:1000}});
  await processAutomation();assert.equal(part.actor.system.health.value,8);assert.equal(main.actor.system.energies[0].value,98);
  await outsider.setFlag("ucurifunke",`automationRequests.${id}`,{kind:"partHealth",target:part.uuid,payload:{delta:-2},status:"pending",at:1,user:gm});
  const original=console.error;console.error=()=>{};
  try {await processAutomation();} finally {console.error=original;}
  assert.equal(outsider.getFlag("ucurifunke",`automationRequests.${id}`).status,"error");assert.equal(part.actor.system.health.value,8);
});

function template(id,definition) {return doc(id,{documentName:"Item",type:"effect",name:id,system:{toObject:()=>clone(definition)},testUserPermission:()=>true});}
const regen={kind:"periodic",interval:20,duration:40,recurring:true,permanent:false,changes:[{target:"LE",mode:"add",value:4}]};

test("periodic effects never apply automatically and an expiry pulse executes once even with duplicate clicks",async()=>{
  setup();const target=token("patient",actor("patientActor","npc",10,30));const source=template("regen",regen);
  const id=await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid,options:{}});
  await combat.setFlag("ucurifunke","totalTicks",20);
  assert.equal(target.actor.system.energies[0].value,10);
  await Promise.all([requestAutomation("effectTrigger",target.uuid,{id,expectedNextAt:20}),requestAutomation("effectTrigger",target.uuid,{id,expectedNextAt:20})]);
  assert.equal(target.actor.system.energies[0].value,14);assert.equal(target.getFlag("ucurifunke","effects")[0].nextAt,40);
  await combat.setFlag("ucurifunke","totalTicks",40);await requestAutomation("effectTrigger",target.uuid,{id,expectedNextAt:40});
  assert.equal(target.actor.system.energies[0].value,18);assert.equal(target.getFlag("ucurifunke","effects").length,0);
});

test("reapplication renews a non-stackable effect, stackable templates create independent instances, and template fields cannot be injected",async()=>{
  setup();const target=token("patient",actor("patientActor","npc",10,30));let source=template("regen",regen);
  await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid,options:{changes:[{target:"LE",mode:"add",value:9999}]}});
  await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid,options:{duration:80}});
  assert.equal(target.getFlag("ucurifunke","effects").length,1);assert.equal(target.getFlag("ucurifunke","effects")[0].expiresAt,80);
  assert.equal(target.getFlag("ucurifunke","effects")[0].changes[0].value,4);
  source=template("stack",{...regen,stackable:true});
  await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid});await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid});
  assert.equal(target.getFlag("ucurifunke","effects").length,3);
});

test("effect deadlines participate in normalization, but never change the initial initiative offset",async()=>{
  setup();combat.flags.ucurifunke.tickBaselineEstablished=false;
  const target=token("patient",actor("patientActor"));const source=template("regen",regen);
  await requestAutomation("effectApply",target.uuid,{sourceUuid:source.uuid});
  const participant=doc("fighter",{name:"fighter",parent:combat,token:target,flags:{ucurifunke:{data:JSON.stringify({ticks:30})}}});
  combat.combatants.set(participant.id,participant);
  combat.updateEmbeddedDocuments=async(_type,updates)=>{for(const update of updates)await combat.combatants.get(update._id).update(update);};
  await normalizeTicks(combat);assert.equal(combat.getFlag("ucurifunke","totalTicks"),0);assert.equal(getCombatantData(participant).ticks,0);
  await participant.setFlag("ucurifunke","data",JSON.stringify({ticks:30}));await normalizeTicks(combat);
  assert.equal(combat.getFlag("ucurifunke","totalTicks"),20);assert.equal(getCombatantData(participant).ticks,10);
});

test("formations spawn distinct groups, move attached parts, and do not move a jointly selected part twice",async()=>{
  setup();const source=actor("dragon"),body=actor("wing","bodypart",12,20);
  game.actors.set(source.id,source);game.actors.set(body.id,body);
  scene.createEmbeddedDocuments=async(_type,rows)=>rows.map(row=>{
    const part=token(row._id,body);Object.assign(part,clone(row));return part;
  });
  scene.updateEmbeddedDocuments=async(_type,rows)=>{for(const row of rows)await scene.tokens.get(row._id).update(row);};
  const template={parts:[{key:"left",actorId:body.id,max:20,dx:1,dy:0,de:0,token:{name:"Left wing",texture:{src:"wing.png"}}}]};
  await source.setFlag("ucurifunke","segmentTemplate",template);
  const main=token("main",source),other=token("other",source);other.x=500;
  for(const fn of hooks.get("createToken")) {fn(main,{});fn(other,{});}
  await new Promise(resolve=>setTimeout(resolve,15));
  const first=main.getFlag("ucurifunke","segmentGroup"),second=other.getFlag("ucurifunke","segmentGroup");
  assert.notEqual(first.id,second.id);assert.notEqual(first.parts[0].id,second.parts[0].id);
  const part=scene.tokens.get(first.parts[0].id),otherPart=scene.tokens.get(second.parts[0].id);
  assert.equal(part.x,200);assert.equal(otherPart.x,600);assert.equal(part.delta.system.health.max,20);
  main.x=200;
  for(const fn of hooks.get("updateToken"))fn(main,{x:200},{updates:[{_id:main.id,x:200}]});
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(part.x,300);assert.equal(otherPart.x,600);
  main.x=300;part.x=400;
  for(const fn of hooks.get("updateToken"))fn(main,{x:300},{updates:[{_id:main.id,x:300},{_id:part.id,x:400}]});
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(part.x,400);assert.equal(main.getFlag("ucurifunke","segmentGroup").anchor.x,300);
});

test("periodic body-part damage forwards actual loss while regeneration remains local",async()=>{
  setup();const main=token("main",actor("dragon","npc",100,100)),part=token("part",actor("wing","bodypart",3,10));
  await main.setFlag("ucurifunke","segmentGroup",{id:"group"});await part.setFlag("ucurifunke","segment",{mainId:main.id,groupId:"group"});
  const source=template("burn",{...regen,changes:[{target:"LE",mode:"add",value:-5}]});
  const id=await requestAutomation("effectApply",part.uuid,{sourceUuid:source.uuid});await combat.setFlag("ucurifunke","totalTicks",20);
  await requestAutomation("effectTrigger",part.uuid,{id,expectedNextAt:20});
  assert.equal(part.actor.system.health.value,0);assert.equal(main.actor.system.energies[0].value,97);
  await requestAutomation("effectRemove",part.uuid,{id});
  const healing=template("heal",regen);const healId=await requestAutomation("effectApply",part.uuid,{sourceUuid:healing.uuid});
  const next=part.getFlag("ucurifunke","effects")[0].nextAt;
  await combat.setFlag("ucurifunke","totalTicks",next);await requestAutomation("effectTrigger",part.uuid,{id:healId,expectedNextAt:next});
  assert.equal(part.actor.system.health.value,4);assert.equal(main.actor.system.energies[0].value,97);
});
