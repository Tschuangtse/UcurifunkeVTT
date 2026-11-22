export const EFFECT_PACK="ucurifunke.effects";
let pendingFolder;
export async function worldEffectFolder() {
  const existing=game.folders.find(folder=>folder.type==="Item"&&folder.name==="Eigene Effekte");
  if(existing||!game.user.isGM)return existing??null;
  pendingFolder??=foundry.documents.Folder.implementation.create({name:"Eigene Effekte",type:"Item"});
  try{return await pendingFolder;}finally{pendingFolder=null;}
}

export async function worldEffectCopy(template) {
  if(!template.inCompendium)return template;
  if(!foundry.documents.Item.implementation.canUserCreate(game.user))throw new Error("Keine Berechtigung zum Anlegen einer Weltvorlage.");
  const existing=game.items.find(item=>item.isOwner&&item.getFlag("ucurifunke","originalEffectSource")===template.uuid);
  if(existing)return existing;
  const source=game.items.fromCompendium(template,{clearFolder:true,keepId:false});
  source.folder=(await worldEffectFolder())?.id??null;
  source.flags??={};source.flags.ucurifunke={...source.flags.ucurifunke,originalEffectSource:template.uuid};
  return foundry.documents.Item.implementation.create(source);
}

export async function createWorldEffect() {
  return foundry.documents.Item.implementation.createDialog({type:"effect",folder:(await worldEffectFolder())?.id??null},{},{types:["effect"]});
}

Hooks.on("renderItemDirectory",(_app,html)=>{
  if(!foundry.documents.Item.implementation.canUserCreate(game.user)||html.querySelector("[data-new-world-effect]"))return;
  const header=html.querySelector(".directory-header, .directory-controls, .header-actions");if(!header)return;
  const button=document.createElement("button");button.type="button";button.dataset.newWorldEffect="";
  button.innerHTML='<i class="fa-solid fa-wand-magic-sparkles" inert></i> Neuer Effekt';
  button.onclick=()=>void createWorldEffect().catch(error=>ui.notifications.error(error.message));header.append(button);
});
