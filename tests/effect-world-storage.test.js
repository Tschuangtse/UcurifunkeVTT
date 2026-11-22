import test from "node:test";
import assert from "node:assert/strict";

let writes=[];
class CoreItem {
  static async createDocuments(data,operation){writes.push({data,operation});return data.map(row=>({...row,pack:operation.pack??null}));}
}
globalThis.Hooks={on(){}};
globalThis.foundry={documents:{Item:CoreItem,Folder:{implementation:{async create(source){const folder={id:"worldEffects",...source};game.folders.push(folder);return folder;}}}}};
const {UcurifunkeItem}=await import("../src/item.js");
function setup(){writes=[];globalThis.game={user:{isGM:true},folders:[]};}

test("effect creation requested from the system pack returns an editable world document",async()=>{
  setup();const source={_id:"packId",name:"New effect",type:"effect",folder:"packFolder"};
  const [item]=await UcurifunkeItem.createDocuments([source],{pack:"ucurifunke.effects",keepId:true});
  assert.equal(item.pack,null);assert.equal(item.folder,"worldEffects");assert.equal(item.img,"icons/svg/aura.svg");assert.equal(item._id,undefined);
  assert.equal(source._id,"packId");assert.equal(source.folder,"packFolder");assert.equal(game.folders.length,1);
});
test("world effects get a persistent default folder while explicit world folders and icons remain",async()=>{
  setup();const rows=await UcurifunkeItem.createDocuments([{name:"A",type:"effect"},{name:"B",type:"effect",folder:"chosen",img:"chosen.svg"}],{});
  assert.equal(rows[0].folder,"worldEffects");assert.equal(rows[1].folder,"chosen");assert.equal(rows[1].img,"chosen.svg");
});
test("mixed system-pack creation redirects effects only, preserving other document types",async()=>{
  setup();const rows=await UcurifunkeItem.createDocuments([{name:"Effect",type:"effect"},{name:"Sword",type:"weapon"}],{pack:"ucurifunke.effects"});
  assert.equal(rows[0].pack,null);assert.equal(rows[1].pack,"ucurifunke.effects");
});
test("embedded items and other compendia retain their native creation behavior",async()=>{
  setup();const parent={id:"actor"};await UcurifunkeItem.createDocuments([{type:"effect"}],{parent});
  assert.equal(writes[0].operation.parent,parent);assert.equal(writes[0].data[0].folder,undefined);
  await UcurifunkeItem.createDocuments([{type:"effect"}],{pack:"other.effects"});assert.equal(writes[1].operation.pack,"other.effects");
});
