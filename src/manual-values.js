import { damageRows, energyRows } from "./energy.js";
export const PRIMARY_ATTRIBUTES={MU:"Mut",KL:"Klugheit",IN:"Intuition",CH:"Charisma",FF:"Fingerfertigkeit",GE:"Gewandtheit",KO:"Konstitution",KK:"Körperkraft"};
export const SECONDARY_ATTRIBUTES={gMR:"Geistige Magieresistenz",kMR:"Körperliche Magieresistenz",RE:"Reaktionsvermögen"};
export const DERIVED_VALUES={OFF:"Offensive",DEF:"Defensive",FKB:"Fernkampf-Basis",WS:"Wundschwelle",TK:"Tragkraft",GS:"Geschwindigkeit",BL:"Bindungslimit",WA:"Wahrnehmung",AS:"Astralsinn",nRS:"Natürlicher Rüstungsschutz",pRS:"Rüstungsschutz",ZK:"Zugkraft",GW:"Gefahrenwert",BS:"Beschwörungsschwierigkeit"};
export const canEditValues=actor=>Boolean(globalThis.game?.user?.isGM&&actor?.isOwner&&["character","npc","retinue"].includes(actor.type));
export function manualDefaults(data){
 const attributes=data.attributes?.length?structuredClone(data.attributes):[...Object.entries(PRIMARY_ATTRIBUTES).map(([key,name])=>({key,name,value:0,kind:"primary"})),...Object.entries(SECONDARY_ATTRIBUTES).map(([key,name])=>({key,name,value:key==="RE"?data.reaction??0:0,kind:"secondary"}))];
 const derived=data.derived?.length?structuredClone(data.derived):Object.entries(DERIVED_VALUES).map(([key,name])=>({key,name,value:0}));
 return{attributes,derived,energies:energyRows(data,{includeEmpty:true}),skills:structuredClone(data.skills??[]),companionDetails:structuredClone(data.companionDetails??[])};
}
export function editedEnergies(data,energies,timestamp=new Date().toISOString()){
 if(energies.length!==3||new Set(energies.map(r=>r.key)).size!==3||!["LE","AE","KE"].every(k=>energies.some(r=>r.key===k)))throw new Error("LE, AE und KE müssen jeweils einmal vorhanden sein.");
 for(const row of energies)if(!Number.isInteger(row.max)||row.max<0||row.max>1000000||!Number.isInteger(row.value)||row.value>row.max||row.value< (row.key==="LE"?-1000000:0))throw new Error("Ungültige Energiewerte: Aktuell darf das Maximum nicht überschreiten.");
 const damage=damageRows(data),missing=energies.find(r=>r.key==="LE").max-energies.find(r=>r.key==="LE").value;
 let difference=missing-damage.reduce((sum,row)=>sum+row.remaining,0);
 if(difference>0)damage.push({source:"Manuelle Anpassung",original:difference,remaining:difference,timestamp});
 else for(const row of [...damage].reverse()){const heal=Math.min(row.remaining,-difference);row.remaining-=heal;difference+=heal;if(!difference)break;}
 return{energies,damage:damage.filter(row=>row.remaining>0)};
}
export function syncSkillAttributes(skills,attributes){
 const byKey=new Map(attributes.map(row=>[row.key.toUpperCase(),row]));
 return skills.map(skill=>({...skill,attributes:skill.attributes.map(row=>{const current=byKey.get(row.key.toUpperCase());return current?{key:current.key,name:current.name,value:current.value}:row;})}));
}
export function editedSkill(fields,previous,attributes){
 const{attribute0,attribute1,attribute2,...entry}=fields,codes=[attribute0,attribute1,attribute2];
 const unchanged=previous&&previous.rollable===entry.rollable&&codes.every((key,i)=>key===(previous.attributes?.[i]?.key??["MU","KL","IN"][i]));
 const selected=unchanged?previous.attributes:codes.map(key=>attributes.find(row=>row.key===key)).filter(Boolean);
 if(entry.rollable&&!unchanged&&selected.length!==3&&!["Nahkampf","Fernkampf"].includes(entry.group))throw new Error("Für würfelbare Fähigkeiten müssen drei vorhandene Attribute gewählt werden.");
 return{...previous,...entry,manual:Boolean(previous?.manual||!previous||!previous.rollable&&entry.rollable),rollName:previous&&previous.name===entry.name?previous.rollName:entry.name,attributes:selected.map(({key,name,value})=>({key,name,value}))};
}
