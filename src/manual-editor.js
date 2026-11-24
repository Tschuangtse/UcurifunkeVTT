import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml as esc } from "./check-card.js";
import { canEditValues, manualDefaults, editedEnergies, syncSkillAttributes, editedSkill, PRIMARY_ATTRIBUTES } from "./manual-values.js";
const {DialogV2}=foundry.applications.api;
const text=(label,field,value="",wide=false)=>`<label class="${wide?"uq-manual-wide":""}">${esc(label)}<input data-field="${field}" value="${esc(value)}" required></label>`;
const num=(label,field,value=0,{min=-1000000,max=1000000,optional=false,step=1}={})=>`<label>${esc(label)}<input data-field="${field}" type="number" value="${value??""}" min="${min}" max="${max}" step="${step}" ${optional?"":"required"}></label>`;
const check=(label,field,value)=>`<label class="uq-manual-check"><input type="checkbox" data-field="${field}" ${value?"checked":""}> ${esc(label)}</label>`;
const textarea=(label,field,value="")=>`<label class="uq-manual-wide">${esc(label)}<textarea data-field="${field}" rows="2">${esc(value)}</textarea></label>`;
const select=(label,field,value,options)=>`<label>${esc(label)}<select data-field="${field}">${[...new Set([value,...options])].map(option=>`<option value="${esc(option)}" ${option===value?"selected":""}>${esc(({primary:"Primär",secondary:"Sekundär"})[option]||option||"Keine")}</option>`).join("")}</select></label>`;
function row(kind,source,index,groups){
 let fields="";
 if(["attributes","derived"].includes(kind))fields=text("Name","name",source.name,kind==="derived")+text("Kürzel","key",source.key)+num("Gesamtwert","value",source.value,{step:kind==="derived"?"any":1})+(kind==="attributes"?select("Art","kind",source.kind||"primary",["primary","secondary"]):"");
 if(kind==="skills")fields=text("Fähigkeit / Spezialisierung","name",source.name,true)+select("Bereich","group",source.group,groups)+num("Gesamtwert","value",source.value)+[0,1,2].map(i=>select("Attribut "+(i+1),"attribute"+i,source.attributes?.[i]?.key??["MU","KL","IN"][i],Object.keys(PRIMARY_ATTRIBUTES))).join("")+check("Würfelbar","rollable",source.rollable)+textarea("Beschreibung","description",source.description??"");
 if(kind==="details")fields=text("Bezeichnung","name",source.name,true)+textarea("Inhalt","value",source.value);
 if(["weapons","armors","equipment"].includes(kind)){
  const s=source.system??{};
  fields=text("Name","name",source.name,true)+(kind==="weapons"?select("Bereich","group",s.group??"Nahkampf",["Nahkampf","Nebenhand","Fernkampf"]):kind==="equipment"?text("Bereich","group",s.group||"Gegenstand"):"")+num("Anzahl","quantity",s.quantity??1,{min:0})+num("Gewicht","weight",s.weight??0,{min:0,step:"any"});
  if(kind==="weapons")fields+=num("AT / FK (gesamt)","attack",s.attack,{optional:true})+num("PA (gesamt)","parry",s.parry,{optional:true})+num("Angriff (Ticks)","speed",s.speed??8,{min:0})+num("Parade (Ticks)","parryTicks",s.parryTicks??4,{min:0})+num("Laden (Ticks)","reload",s.reload,{min:0,optional:true})+num("BE-Toleranz","mobilityTolerance",s.mobilityTolerance??0,{min:0})+`<label>Schaden<input data-field="damage" value="${esc(s.damage??"")}" placeholder="2W6+4"></label><label>Reichweite / Distanzklasse<input data-field="reach" value="${esc(s.reach??"")}"></label>`+check("AT / PA sind fertige Probenwerte","preparedCheck",s.preparedCheck??true);
  if(kind==="armors")fields+=num("Rüstungsschutz","protection",s.protection??0,{min:0})+num("Beeinträchtigung","mobilityPenalty",s.mobilityPenalty??0,{min:0})+check("Angelegt","equipped",s.equipped);
  fields+=check("Dabei","carried",s.carried??true)+textarea("Beschreibung / Besonderheiten","description",s.description??"");
 }
 return `<article class="uq-manual-row" data-manual-kind="${kind}" data-index="${index}"><div class="uq-manual-grid">${fields}</div><button type="button" data-remove-manual aria-label="Eintrag entfernen"><i class="fa-solid fa-trash" inert></i></button></article>`;
}
const values=root=>Object.fromEntries([...root.querySelectorAll("[data-field]")].map(input=>[input.dataset.field,input.type==="checkbox"?input.checked:input.type==="number"?(input.value===""?null:input.valueAsNumber):input.value.trim()]));
const regenerationNumbers={required:"Benötigte Ruhezeit (Stunden)",nonSleeper:"Nicht-Schläfer (Stufe)",astralRegenerationLevel:"Astrale Regeneration (Stufe)",ordinationRank:"Weihegrad"};
const regenerationFlags={fastHealing:"Schnelle Heilung",sleepDisorder:"Schlafstörung",metalAffinity:"Metallaffiner Zauberer",severeIronBan:"Schwerer Bann des Eisens",penance:"Bußqueste",useLeyLines:"Kraftlinienmagie"};
export async function openManualEditor(actor){
 if(!canEditValues(actor))throw new Error("Nur die Spielleitung darf Spielwerte bearbeiten.");
 const original=actor.toObject(),snapshot=JSON.stringify({system:original.system,items:original.items,name:original.name}),data=original.system,draft=manualDefaults(data);
 const groups=actor.type==="retinue"?["Mundan","Magisch","Klerikal"]:data.npcGenerator?["Aufgabenbereiche","Nahkampf","Fernkampf","Zauber","Rituale","Liturgien","Merkmale"]:["Körper","Gesellschaft","Natur","Wissen","Handwerk","Hobby","Nahkampf","Fernkampf","Zauber","Rituale","Wunder"];
 const sections={attributes:draft.attributes,derived:draft.derived,skills:draft.skills,details:draft.companionDetails.filter(row=>!["LE","AE","KE"].includes(row.name)),
  weapons:original.items.filter(i=>i.type==="weapon"),armors:original.items.filter(i=>i.type==="equipment"&&i.system.group==="Rüstung"),equipment:original.items.filter(i=>i.type==="equipment"&&i.system.group!=="Rüstung")};
 const list=(kind,label)=>`<h3>${label}</h3><div data-manual-list="${kind}">${sections[kind].map((source,i)=>row(kind,source,i,groups)).join("")}</div><button type="button" data-add-manual="${kind}"><i class="fa-solid fa-plus" inert></i> ${label}: Eintrag hinzufügen</button>`;
 const tabs={general:"Grundwerte",energies:"Energien",skills:"Fähigkeiten",inventory:"Angriffe & Ausrüstung",details:"Eigenschaften"};
 const result=await DialogV2.prompt({classes:[...SYSTEM_DIALOG_CLASSES,"uq-manual-editor"],window:{title:"Spielwerte bearbeiten · "+actor.name,resizable:true},position:{width:1000,height:770},modal:true,rejectClose:false,
 content:`<nav class="uq-manual-tabs">${Object.entries(tabs).map(([key,label],i)=>`<button type="button" data-manual-tab="${key}" aria-pressed="${i===0}">${label}</button>`).join("")}</nav><div class="uq-manual-panels">
 <section data-manual-panel="general"><div class="uq-manual-grid" data-manual-identity>${text("Name","name",actor.name,true)}<label>Volk / Spezies<input data-field="race" value="${esc(data.race)}"></label><label>Gefolgeart<input data-field="companionKind" list="uq-companion-kinds" value="${esc(data.companionKind)}"><datalist id="uq-companion-kinds">${["Dämon","Elementar","Golem","Tier","Person","Untoter","Chimäre","Daimonid","Pflanzenchimäre"].map(x=>`<option value="${x}">`).join("")}</datalist></label>${num("Beeinträchtigung","impairment",data.impairment,{min:0})}${num("Natürlicher Rüstungsschutz","naturalArmor",data.naturalArmor,{min:0})}${num("Zusätzlicher RS (optional)","companionArmor",data.companionArmor,{optional:true,min:0})}${num("Ausweichen (optional)","dodgeOverride",data.dodgeOverride,{optional:true})}</div><p>Gesamtwerte werden direkt eingetragen. Abgeleitete Werte werden nicht automatisch neu berechnet.</p>${list("attributes","Attribute")}${list("derived","Abgeleitete Werte")}<div class="uq-manual-grid" data-manual-traits>${check("Gelenknachteil","hasJointPenalty",data.hasJointPenalty)}${check("Eisen","hasIron",data.hasIron)}${check("Ausdauer","hasEndurance",data.hasEndurance)}${check("Rüstungsgewöhnung","armorTraining",data.armorTraining)}</div></section>
 <section data-manual-panel="energies" hidden><h3>Energien</h3><div class="uq-manual-energy">${draft.energies.map(e=>`<fieldset data-energy-key="${e.key}"><legend>${e.key}</legend>${num("Maximum","max",e.max,{min:0})}${num("Aktuell","value",e.value,{min:e.key==="LE"?-1000000:0})}</fieldset>`).join("")}</div><p>Änderungen der LE werden in der Schadensübersicht berücksichtigt. Bestehende Schadensgründe bleiben soweit möglich erhalten.</p><h3>Regenerationsvorgaben</h3><div class="uq-manual-grid" data-manual-regeneration>${Object.entries(regenerationNumbers).map(([key,label])=>num(label,key,data.regeneration?.[key]??(key==="required"?6:key==="ordinationRank"?1:0),{min:key==="ordinationRank"?1:0})).join("")}${Object.entries(regenerationFlags).map(([key,label])=>check(label,key,data.regeneration?.[key])).join("")}</div></section>
 <section data-manual-panel="skills" hidden><p>Würfelbare Fähigkeiten verwenden den Gesamtwert und die drei gewählten Attribute. Nicht würfelbare Merkmale können ohne Würfeloption erfasst werden.</p>${list("skills","Fähigkeiten")}</section>
 <section data-manual-panel="inventory" hidden><p>AT/FK und PA können frei bleiben, wenn kein entsprechender Wurf möglich ist. Bei fertigen Probenwerten die gleichnamige Option aktiviert lassen.</p>${list("weapons","Angriffe / Waffen")}${list("armors","Rüstung")}${list("equipment","Ausrüstung")}</section>
 <section data-manual-panel="details" hidden>${list("details","Eigenschaften / Notizen")}</section></div>`,
 render:(_event,dialog)=>{const root=dialog.element;root.addEventListener("click",event=>{const tab=event.target.closest("[data-manual-tab]");if(tab){root.querySelectorAll("[data-manual-panel]").forEach(panel=>panel.hidden=panel.dataset.manualPanel!==tab.dataset.manualTab);root.querySelectorAll("[data-manual-tab]").forEach(button=>button.setAttribute("aria-pressed",String(button===tab)));}const remove=event.target.closest("[data-remove-manual]");if(remove)remove.closest("[data-manual-kind]").remove();const add=event.target.closest("[data-add-manual]");if(add){const kind=add.dataset.addManual,source=kind==="attributes"?{name:"",key:"",value:0,kind:"primary"}:kind==="derived"?{name:"",key:"",value:0}:kind==="skills"?{name:"",group:groups[0],value:0,rollable:true,attributes:[]}:kind==="details"?{name:"",value:""}:{name:"",system:{}};root.querySelector(`[data-manual-list="${kind}"]`).insertAdjacentHTML("beforeend",row(kind,source,-1,groups));} });root.addEventListener("input",event=>{const input=event.target;if(input.matches("[data-manual-identity] [data-field=naturalArmor]")){for(const row of root.querySelectorAll("[data-manual-kind=derived]"))if(row.querySelector("[data-field=key]").value.toLowerCase()==="nrs")row.querySelector("[data-field=value]").value=input.value;}const row=input.closest("[data-manual-kind=derived]");if(row&&input.dataset.field==="value"&&row.querySelector("[data-field=key]").value.toLowerCase()==="nrs")root.querySelector("[data-manual-identity] [data-field=naturalArmor]").value=input.value;});root.querySelector("form")?.addEventListener("invalid",event=>{const panel=event.target.closest("[data-manual-panel]");if(panel)root.querySelector(`[data-manual-tab="${panel.dataset.manualPanel}"]`).click();},true);},
 ok:{label:"Spielwerte speichern",callback:(_event,button)=>{
  const root=button.form;
  const identity=values(root.querySelector("[data-manual-identity]"));
  const read=kind=>[...root.querySelectorAll(`[data-manual-kind="${kind}"]`)].map(el=>{const index=Number(el.dataset.index);return{...values(el),previous:sections[kind][index],index};});
  const attributes=read("attributes").map(({previous,index,...row})=>row),derived=read("derived").map(({previous,index,...row})=>row);
  for(const rows of[attributes,derived])if(new Set(rows.map(row=>row.key.toUpperCase())).size!==rows.length)throw new Error("Attribut- und Wertekürzel dürfen nicht doppelt vorkommen.");
  const energy=editedEnergies(data,[...root.querySelectorAll("[data-energy-key]")].map(el=>({key:el.dataset.energyKey,...values(el)})));
  const skills=syncSkillAttributes(read("skills").map(({previous,index,...entry})=>editedSkill(entry,previous,attributes)),attributes);
  const details=[...draft.companionDetails.filter(row=>["LE","AE","KE"].includes(row.name)),...read("details").map(({previous,index,...row})=>row)];
  for(const e of energy.energies){const d=derived.find(row=>row.key===e.key);if(d)d.value=e.max;}
  const itemChanges=[...read("weapons").map(row=>({...row,type:"weapon"})),...read("armors").map(row=>({...row,type:"equipment",group:"Rüstung"})),...read("equipment").map(row=>({...row,type:"equipment"}))];
  const items=itemChanges.map(({previous,index,type,name,...system})=>({...previous,type,name,system:{...previous?.system,...system}}));
  return{identity,system:{...energy,attributes,derived,skills,companionDetails:details,regeneration:values(root.querySelector("[data-manual-regeneration]")),...values(root.querySelector("[data-manual-traits]")),reaction:Math.max(0,attributes.find(row=>row.key.toUpperCase()==="RE")?.value??data.reaction)},items};
 }}});
 if(!result)return;
 if(!canEditValues(actor))throw new Error("Keine Berechtigung zum Bearbeiten.");
 const latest=actor.toObject();if(snapshot!==JSON.stringify({system:latest.system,items:latest.items,name:latest.name}))throw new Error("Die Spielwerte wurden inzwischen geändert. Bitte den Editor erneut öffnen.");
 const {name,...identity}=result.identity;
 const retained=new Set(result.items.map(item=>item._id).filter(Boolean));
 const removed=original.items.filter(item=>["weapon","equipment"].includes(item.type)&&!retained.has(item._id)).map(item=>item._id);
 // Validate every prospective document before making any changes.
 actor.clone({name,system:{...data,...identity,...result.system}},{keepId:true});
 for(const item of result.items)new CONFIG.Item.documentClass(item,{parent:actor});
 const oldItems=result.items.filter(item=>item._id),newItems=result.items.filter(item=>!item._id);
 if(oldItems.length)await actor.updateEmbeddedDocuments("Item",oldItems);
 if(newItems.length)await actor.createEmbeddedDocuments("Item",newItems);
 if(removed.length)await actor.deleteEmbeddedDocuments("Item",removed);
 const patch={name,...Object.fromEntries(Object.entries({...identity,...result.system}).map(([key,value])=>["system."+key,value]))};
 if(actor.prototypeToken.name===original.name)patch["prototypeToken.name"]=name;
 await actor.update(patch);
}
