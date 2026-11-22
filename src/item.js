import { EFFECT_PACK, WORLD_EFFECT_PACK, ensureEffectLibrary } from "./effect-library.js";

export class UcurifunkeItem extends foundry.documents.Item {
  static async createDocuments(data=[],operation={}) {
    const redirect=!operation.parent&&(!operation.pack||operation.pack===EFFECT_PACK)&&data.some(row=>row.type==="effect");
    if(!redirect)return super.createDocuments(data,operation);
    const pack=await ensureEffectLibrary();
    if(!pack)throw new Error("Die Spielleitung muss die Effektbibliothek einmal initialisieren.");
    const result=[];
    for(const row of data){
      if(row.type!=="effect"){result.push(...await super.createDocuments([row],operation));continue;}
      const source={...row,img:row.img||"icons/svg/aura.svg"};delete source._id;delete source.folder;
      result.push(...await super.createDocuments([source],{...operation,pack:WORLD_EFFECT_PACK,keepId:false}));
    }
    return result;
  }
}
