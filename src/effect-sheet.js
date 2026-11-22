import { EFFECT_TARGETS, PRIMARY_KEYS, validateEffect } from "./effect-rules.js";
import { FILTER_TYPES, allowedFilters, CHECK_CATEGORIES, ACTION_CATEGORIES, ACTION_FILTERS } from "./effect-filters.js";
import { escapeHtml as esc } from "./check-card.js";
import { EFFECT_PACK, worldEffectCopy } from "./effect-library.js";

const { api, sheets } = foundry.applications;
const permits = (target, kind) => !(kind === "continuous" && target.periodic || kind === "periodic" && target.continuous);
const options = (entries, selected) => entries.map(([key,label])=>`<option value="${esc(key)}" ${key===selected?"selected":""}>${esc(label)}</option>`).join("");
function filterMarkup(change) {
  const types=allowedFilters(change.target),type=types.includes(change.filterType)?change.filterType:"all";
  let entries=type==="checkCategory"?CHECK_CATEGORIES:type==="actionCategory"?ACTION_CATEGORIES:type==="actionId"?ACTION_FILTERS:type==="attribute"?[...PRIMARY_KEYS,"gMR","kMR","RE"].map(key=>[key,key]):null;
  if(type==="skillGroup")entries=[...new Set(["Körper","Gesellschaft","Natur","Wissen","Handwerk","Hobby","Nahkampf","Fernkampf","Zauber","Rituale","Wunder",...[...(globalThis.game?.actors??[])].flatMap(actor=>actor.system.skills?.map(skill=>skill.group)??[])])].filter(Boolean).map(key=>[key,key]);
  return `<div class="uq-effect-filter" ${types.length===1?"hidden":""}>
    <label>Geltungsbereich<select data-filter-type>${options(types.map(key=>[key,FILTER_TYPES[key]]),type)}</select></label>
    <label ${type==="all"?"hidden":""}>Filter${entries?`<select data-filter-value required>${options(entries,change.filterValue)}</select>`:`<input data-filter-value value="${esc(change.filterValue??"")}" maxlength="120" placeholder="Name der Fähigkeit" ${type==="all"?"":"required"}>`}</label></div>`;
}
function rowMarkup(change, kind) {
  if(!EFFECT_TARGETS.some(target=>target.key===change.target&&permits(target,kind)))change={...change,target:kind==="continuous"?"actionTicks":"LE",filterType:"all",filterValue:""};
  return `<div class="uq-effect-change" data-effect-row><div class="uq-effect-values">
    <select data-target aria-label="Zielwert" required>${options(EFFECT_TARGETS.filter(target=>permits(target,kind)).map(target=>[target.key,target.label]),change.target)}</select>
    <select data-mode aria-label="Berechnung">${options([["add","Absolut (+/−)"],["percent","Prozent (+/−)"]],change.mode)}</select>
    <input data-value aria-label="Wert" type="number" min="${["checkPenalty","checkBonus"].includes(change.target)?0:-100000}" max="100000" step="any" value="${change.value}" required>
    <button type="button" data-remove-change aria-label="Wirkung entfernen"><i class="fa-solid fa-trash" inert></i></button></div>${filterMarkup(change)}</div>`;
}
function readRow(row) {return {target:row.querySelector("[data-target]").value,mode:row.querySelector("[data-mode]").value,value:Number(row.querySelector("[data-value]").value),filterType:row.querySelector("[data-filter-type]").value,filterValue:row.querySelector("[data-filter-value]").value};}
export class EffectSheet extends api.HandlebarsApplicationMixin(sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = {classes:["ucurifunke-dialog","uq-effect-sheet"],tag:"form",position:{width:760,height:690},window:{resizable:true},form:{closeOnSubmit:false,submitOnChange:false}};
  static PARTS = {main:{template:"systems/ucurifunke/templates/effect.hbs"}};
  async _prepareContext(options) {
    const systemPack=this.item.pack===EFFECT_PACK||Boolean(this.item.getFlag("ucurifunke","effectLibraryDestination"));
    return {...await super._prepareContext(options),name:this.item.name,img:this.item.img,data:this.item.system,continuous:this.item.system.kind==="continuous",editable:this.isEditable&&!systemPack,systemPack,canCopy:systemPack&&foundry.documents.Item.implementation.canUserCreate(game.user)};
  }
  async _onRender(context,options) {
    await super._onRender(context,options);
    const form=this.element,data=this.item.system,rows=form.querySelector("[data-effect-changes]"),kind=form.querySelector('[name="system.kind"]');
    rows.innerHTML=data.changes.map(change=>rowMarkup(change,data.kind)).join("");
    form.querySelector("[data-add-change]").onclick=()=>rows.insertAdjacentHTML("beforeend",rowMarkup({target:kind.value==="continuous"?"actionTicks":"LE",mode:"add",value:1},kind.value));
    rows.onclick=event=>{if(context.editable&&event.target.closest("[data-remove-change]"))event.target.closest("[data-effect-row]").remove();};
    rows.onchange=event=>{
      if(!event.target.matches("[data-target],[data-filter-type]"))return;
      const row=event.target.closest("[data-effect-row]"),change=readRow(row);
      row.querySelector(".uq-effect-filter").outerHTML=filterMarkup(change);
      row.querySelector("[data-value]").min=["checkPenalty","checkBonus"].includes(change.target)?"0":"-100000";
    };
    const timing=()=>{
      form.querySelector('[name="system.interval"]').closest("label").hidden=kind.value==="continuous";
      form.querySelector('[name="system.recurring"]').closest("label").hidden=kind.value==="continuous";
      form.querySelector('[name="system.duration"]').readOnly=form.querySelector('[name="system.permanent"]').checked;
    };
    kind.onchange=()=>{rows.innerHTML=[...rows.children].map(row=>rowMarkup(readRow(row),kind.value)).join("");timing();};
    form.querySelector('[name="system.permanent"]').onchange=timing;timing();
    if(!context.editable)for(const input of form.querySelectorAll("input,textarea,select,button[type=submit],[data-add-change],[data-remove-change]"))input.disabled=true;
    const icon=form.querySelector("[data-effect-icon]");
    if(icon)icon.onclick=()=>{
      const input=form.querySelector('[name="img"]');
      const Picker=foundry.applications.apps.FilePicker.implementation;
      void new Picker({type:"image",current:input.value,callback:path=>{input.value=path;form.querySelector("[data-effect-preview]").src=path;},document:this.item}).browse();
    };
    const image=form.querySelector('[name="img"]');
    if(image)image.oninput=()=>{form.querySelector("[data-effect-preview]").src=image.value;};
    const edit=form.querySelector("[data-edit-world-effect]");
    if(edit)edit.onclick=()=>{form.querySelector('[name="name"]').focus();form.querySelector('[name="name"]').select();};
    const copy=form.querySelector("[data-copy-effect]");
    if(copy)copy.onclick=async()=>{
      try {
        const item=await worldEffectCopy(this.item);
        await this.close();
        await item.sheet.render({force:true});
      }catch(error){ui.notifications.error(error.message);}
    };
  }
  _processFormData(event,form,formData) {
    if(this.item.pack===EFFECT_PACK||this.item.getFlag("ucurifunke","effectLibraryDestination"))throw new Error("Bitte die Vorlage im Effektkompendium bearbeiten.");
    const data=super._processFormData(event,form,formData);data.system.changes=[...form.querySelectorAll("[data-effect-row]")].map(readRow);
    data.system=validateEffect(data.system);return data;
  }
}
