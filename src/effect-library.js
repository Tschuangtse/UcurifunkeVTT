export const EFFECT_PACK="ucurifunke.effects";
export const WORLD_EFFECT_PACK="world.ucurifunke-effects";
let pendingLibrary;
const libraryFlag=(item,key)=>item.getFlag("ucurifunke",key);
Hooks.once("init",()=>game.settings.register("ucurifunke","effectLibrarySeededSources",{scope:"world",config:false,type:Array,default:[]}));

// A source UUID is the migration identity. Names are intentionally not unique:
// two different user templates with the same name must both survive.
export function effectDestination(documents,source) {
  return documents.find(item=>libraryFlag(item,"effectLibrarySource")===source.uuid
    ||libraryFlag(item,"effectLibraryImports")?.includes(source.uuid)
    ||libraryFlag(source,"originalEffectSource")&&libraryFlag(item,"effectLibrarySource")===libraryFlag(source,"originalEffectSource"));
}
function sourceData(source) {
  const data=source.toObject();delete data._id;delete data.folder;delete data._stats;
  data.ownership={default:2};
  return data;
}
export function refreshEffectLibrary() {
  const stock=game.packs.get(EFFECT_PACK);
  if(stock&&!Object.hasOwn(stock,"visible"))Object.defineProperty(stock,"visible",{configurable:true,get:()=>!game.packs.has(WORLD_EFFECT_PACK)});
  game.packs.initializeTree();
  ui.compendium?.render({force:true});
}
export async function ensureEffectLibrary() {
  if(pendingLibrary)return pendingLibrary;
  if(!game.user.isGM)return game.packs.get(WORLD_EFFECT_PACK)??null;
  pendingLibrary=(async()=>{
    let pack=game.packs.get(WORLD_EFFECT_PACK);
    if(!pack)pack=await foundry.documents.collections.CompendiumCollection.createCompendium({name:"ucurifunke-effects",label:"Ucurifunke · Effekte",type:"Item",system:"ucurifunke",ownership:{PLAYER:"OBSERVER",ASSISTANT:"OWNER"}});
    if(pack.locked)await pack.configure({locked:false});
    const documents=await pack.getDocuments();
    const stock=game.packs.get(EFFECT_PACK);
    const seeded=game.settings.get("ucurifunke","effectLibrarySeededSources"),seen=new Set(seeded);
    for(const source of await stock?.getDocuments()??[]){
      if(source.type!=="effect"||seen.has(source.uuid))continue;
      seen.add(source.uuid);
      if(effectDestination(documents,source))continue;
      const data=sourceData(source);data.flags??={};data.flags.ucurifunke={...data.flags.ucurifunke,effectLibrarySource:source.uuid};
      documents.push(await foundry.documents.Item.implementation.create(data,{pack:pack.collection}));
    }
    if(seen.size!==seeded.length)await game.settings.set("ucurifunke","effectLibrarySeededSources",[...seen]);
    for(const source of game.items.filter(item=>item.type==="effect")){
      if(libraryFlag(source,"effectLibraryDestination"))continue;
      let destination=effectDestination(documents,source);
      if(!destination){
        const data=sourceData(source);data.flags??={};data.flags.ucurifunke={...data.flags.ucurifunke,effectLibrarySource:source.uuid,effectLibraryImports:[source.uuid]};
        destination=await foundry.documents.Item.implementation.create(data,{pack:pack.collection});documents.push(destination);
      }else if(!libraryFlag(destination,"effectLibraryImports")?.includes(source.uuid)){
        const data=sourceData(source);data.flags??={};data.flags.ucurifunke={...destination.flags.ucurifunke,...data.flags.ucurifunke,effectLibrarySource:libraryFlag(destination,"effectLibrarySource"),effectLibraryImports:[...libraryFlag(destination,"effectLibraryImports")??[],source.uuid]};
        await destination.update(data);
      }
      // Retain the old document so existing UUID references stay valid. Its
      // editor opens the migrated version instead of creating a second branch.
      if(libraryFlag(source,"effectLibraryDestination")!==destination.uuid)await source.setFlag("ucurifunke","effectLibraryDestination",destination.uuid);
    }
    refreshEffectLibrary();return pack;
  })();
  try{return await pendingLibrary;}finally{pendingLibrary=null;}
}
export async function worldEffectCopy(template) {
  const pack=await ensureEffectLibrary();
  if(!pack)throw new Error("Die Spielleitung muss die Effektbibliothek einmal initialisieren.");
  if(template.pack===pack.collection)return template;
  const documents=await pack.getDocuments(),existing=effectDestination(documents,template);
  if(existing)return existing;
  if(!game.user.isGM)throw new Error("Nur die Spielleitung darf Effektvorlagen anlegen.");
  const data=sourceData(template);data.flags??={};data.flags.ucurifunke={...data.flags.ucurifunke,effectLibrarySource:template.uuid};
  return foundry.documents.Item.implementation.create(data,{pack:pack.collection});
}
export async function createWorldEffect() {
  const pack=await ensureEffectLibrary();
  if(!pack)throw new Error("Die Effektbibliothek ist noch nicht verfügbar.");
  return foundry.documents.Item.implementation.createDialog({type:"effect"},{pack:pack.collection},{types:["effect"]});
}
Hooks.once("ready",()=>{
  refreshEffectLibrary();
  if(game.user.isGM&&(!game.users.activeGM||game.users.activeGM.id===game.user.id))void ensureEffectLibrary().catch(error=>{console.error("Ucurifunke | Effektbibliothek",error);ui.notifications.error("Effektbibliothek konnte nicht vollständig übernommen werden: "+error.message);});
});
Hooks.on("userConnected",()=>{
  if(game.ready&&!game.packs.has(WORLD_EFFECT_PACK)&&game.user.isGM&&game.users.activeGM?.id===game.user.id)void ensureEffectLibrary().catch(error=>ui.notifications.error(error.message));
});
Hooks.on("renderCompendiumDirectory",()=>refreshStockVisibility());
function refreshStockVisibility(){
  // Other connected clients receive newly created packs without running ready
  // again. Rebuild their directory once the shared library exists.
  const stock=game.packs.get(EFFECT_PACK);
  if(stock&&game.packs.has(WORLD_EFFECT_PACK))document.querySelectorAll('[data-pack="ucurifunke.effects"],[data-entry-id="ucurifunke.effects"]').forEach(row=>row.remove());
}
Hooks.on("renderItemDirectory",(_app,html)=>{
  if(!game.user.isGM||html.querySelector("[data-new-world-effect]"))return;
  const header=html.querySelector(".directory-header, .directory-controls, .header-actions");if(!header)return;
  const button=document.createElement("button");button.type="button";button.dataset.newWorldEffect="";
  button.innerHTML='<i class="fa-solid fa-wand-magic-sparkles" inert></i> Neuer Effekt';
  button.onclick=()=>void createWorldEffect().catch(error=>ui.notifications.error(error.message));header.append(button);
});
