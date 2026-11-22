import { EFFECT_PACK, worldEffectFolder } from "./effect-library.js";

export class UcurifunkeItem extends foundry.documents.Item {
  static async createDocuments(data=[],operation={}) {
    const redirect=operation.pack===EFFECT_PACK&&!operation.parent;
    if(operation.parent||operation.pack&&!redirect||!data.some(row=>row.type==="effect"))return super.createDocuments(data,operation);
    const folder=await worldEffectFolder();
    const prepare=row=>({...row,img:row.img||"icons/svg/aura.svg",folder:redirect?folder?.id??null:row.folder??folder?.id??null});
    if(!redirect)return super.createDocuments(data.map(row=>row.type==="effect"?prepare(row):row),operation);
    const {pack,...worldOptions}=operation;const result=[];
    // Returning a world document lets Foundry's native creation dialog open
    // the editable world sheet instead of a read-only system-pack document.
    for(const row of data){
      if(row.type!=="effect"){result.push(...await super.createDocuments([row],operation));continue;}
      const source=prepare(row);delete source._id;
      result.push(...await super.createDocuments([source],{...worldOptions,keepId:false}));
    }
    return result;
  }
}
