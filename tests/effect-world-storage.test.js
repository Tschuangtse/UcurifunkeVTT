import test from "node:test";
import assert from "node:assert/strict";
let writes=[],counter=0;
class Doc{
 constructor(data,pack){Object.assign(this,structuredClone(data));this.flags??={};this.id??=String(++counter);this.uuid=pack?`Compendium.${pack}.Item.${this.id}`:`Item.${this.id}`;this.pack=pack;}
 getFlag(scope,key){return this.flags[scope]?.[key];}
 async setFlag(scope,key,value){this.flags[scope]??={};this.flags[scope][key]=value;}
 toObject(){const{uuid,pack,...data}=this;return structuredClone(data);}
 async update(data){Object.assign(this,structuredClone(data));return this;}
}
class CoreItem{
 static canUserCreate(){return true;}
 static async create(data,operation={}){return(await this.createDocuments([data],operation))[0];}
 static async createDocuments(data,operation={}){writes.push({data,operation});return data.map(row=>{const doc=new Doc(row,operation.pack);const p=game.packs.get(operation.pack);if(p)p.docs.push(doc);return doc;});}
}
globalThis.Hooks={on(){},once(){}};
globalThis.ui={compendium:{render(){}}};
globalThis.foundry={documents:{Item:CoreItem,collections:{CompendiumCollection:{async createCompendium(metadata){const pack=makePack('world.ucurifunke-effects',[],metadata);game.packs.set(pack.collection,pack);return pack;}}}}};
const {UcurifunkeItem}=await import('../src/item.js');const{ensureEffectLibrary,worldEffectCopy}=await import('../src/effect-library.js');CoreItem.implementation=UcurifunkeItem;
function makePack(collection,docs=[],metadata={}){return{collection,metadata,docs,locked:false,async getDocuments(){return [...this.docs];},async configure(data){Object.assign(this,data);}};}
function setup({stock=[],world=[]}={}){writes=[];counter=0;const packs=new Map([['ucurifunke.effects',makePack('ucurifunke.effects',stock)]]);packs.initializeTree=()=>{};const settings=new Map();globalThis.game={user:{isGM:true},items:world,packs,settings:{get:(_scope,key)=>settings.get(key)??[],set:async(_scope,key,value)=>settings.set(key,value)}};}
function source(name,id,pack='ucurifunke.effects',flags={}){return new Doc({id,name,type:'effect',img:'icon.svg',system:{value:4},flags},pack);}
test('native system-pack creation returns the editable shared world-compendium document',async()=>{setup();const data={_id:'old',name:'New',type:'effect',folder:'oldFolder'};const[d]=await UcurifunkeItem.createDocuments([data],{pack:'ucurifunke.effects',keepId:true});assert.equal(d.pack,'world.ucurifunke-effects');assert.equal(d.folder,undefined);assert.equal(d._id,undefined);assert.equal(d.img,'icons/svg/aura.svg');assert.equal(data._id,'old');});
test('new world effects go to the shared compendium while other documents keep their destination',async()=>{setup();const rows=await UcurifunkeItem.createDocuments([{name:'Effect',type:'effect',img:'custom.svg'},{name:'Weapon',type:'weapon'}],{});assert.equal(rows[0].pack,'world.ucurifunke-effects');assert.equal(rows[0].img,'custom.svg');assert.equal(rows[1].pack,undefined);});
test('embedded items and other compendia retain native creation behavior',async()=>{setup();const parent={id:'actor'};await UcurifunkeItem.createDocuments([{type:'effect'}],{parent});assert.equal(writes[0].operation.parent,parent);await UcurifunkeItem.createDocuments([{type:'effect'}],{pack:'other.effects'});assert.equal(writes[1].operation.pack,'other.effects');});
test('migration seeds standards and custom world effects once, retaining names, icons, values and old UUID documents',async()=>{const stock=source('Regeneration','stock'),world=source('Custom','world',null);setup({stock:[stock],world:[world]});const pack=await ensureEffectLibrary();assert.equal(pack.docs.length,2);assert.equal(pack.docs[1].name,'Custom');assert.equal(pack.docs[1].img,'icon.svg');assert.deepEqual(pack.docs[1].system,{value:4});assert.equal(world.getFlag('ucurifunke','effectLibraryDestination'),pack.docs[1].uuid);assert.equal(game.items[0],world);await ensureEffectLibrary();assert.equal(pack.docs.length,2);});
test('customized standard replaces its seed once; later library edits survive re-initialization and updates',async()=>{const stock=source('Regeneration','stock'),world=source('Improved','world',null,{ucurifunke:{originalEffectSource:stock.uuid}});world.system.value=8;setup({stock:[stock],world:[world]});const pack=await ensureEffectLibrary();assert.equal(pack.docs.length,1);assert.equal(pack.docs[0].system.value,8);await pack.docs[0].update({name:'Edited in library',system:{value:12}});stock.system.value=30;await ensureEffectLibrary();assert.equal(pack.docs.length,1);assert.equal(pack.docs[0].name,'Edited in library');assert.equal(pack.docs[0].system.value,12);assert.equal(await worldEffectCopy(world),pack.docs[0]);});
test('equal names remain distinct templates and a new standard is added without overwriting existing effects',async()=>{const a=source('Same','A'),b=source('Same','B',null);setup({stock:[a],world:[b]});const pack=await ensureEffectLibrary();assert.equal(pack.docs.length,2);game.packs.get('ucurifunke.effects').docs.push(source('New standard','C'));await ensureEffectLibrary();assert.equal(pack.docs.length,3);});
test('players can read the existing library without migration or unlocking it',async()=>{setup();game.user.isGM=false;assert.equal(await ensureEffectLibrary(),null);const pack=makePack('world.ucurifunke-effects');pack.locked=true;game.packs.set(pack.collection,pack);assert.equal(await ensureEffectLibrary(),pack);assert.equal(pack.locked,true);assert.equal(writes.length,0);});

test('deleting a seeded or migrated template does not resurrect it on restart',async()=>{const stock=source('Standard','A'),world=source('Own','B',null);setup({stock:[stock],world:[world]});const pack=await ensureEffectLibrary();assert.equal(pack.docs.length,2);pack.docs=[];await ensureEffectLibrary();assert.equal(pack.docs.length,0);});