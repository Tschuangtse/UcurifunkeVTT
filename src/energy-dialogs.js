import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml } from "./check-card.js";
import { DAMAGE_SOURCES, damageRows, energyRows, isWound, regenerate, regenerationAmounts, regenerationDefaults } from "./energy.js";

const { DialogV2 } = foundry.applications.api;
const field = (label, name, value = 0, max = 1000, min = 0) =>
  `<label class="ucurifunke-energy-field"><span>${label}</span><input type="number" name="${name}" min="${min}" max="${max}" step="1" required value="${value}"></label>`;
const checkbox = (label, name, checked) =>
  `<label><input type="checkbox" name="${name}" ${checked ? "checked" : ""}> ${label}</label>`;
const submit = (event, button) => Object.fromEntries([...button.form.elements]
  .filter(input => input.name).map(input => [input.name, input.type === "checkbox" ? input.checked : Number(input.value)]));
function assertUnchanged(actor, snapshot) {
  if (!actor.isOwner || JSON.stringify(actor.system.toObject()) !== snapshot) {
    throw new Error("Die Spielwerte wurden inzwischen geändert. Bitte den Dialog erneut öffnen.");
  }
}

export async function openHealth(actor) {
  if (!actor.isOwner) return;
  const data = actor.system;
  const snapshot=JSON.stringify(data.toObject());
  const energies=energyRows(data);
  const le=energies.find(row=>row.key==="LE");
  if (!le) return;
  const threshold=data.derived.find(row=>row.key==="WS")?.value ?? 0;
  const history=damageRows(data);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("de-DE") : "Unbekannt";
  const result=await DialogV2.prompt({
    classes:[...SYSTEM_DIALOG_CLASSES,"ucurifunke-energy-dialog"], window:{title:"Lebensenergie und Schadensübersicht"},position:{width:640},
    content:`<div><p>Aktuelle LE <strong data-current-le>${le.value}</strong> / ${le.max} · Wundschwelle ${threshold}</p>
      <fieldset><legend>Neuen Schaden eintragen</legend>${Object.entries(DAMAGE_SOURCES).map(([key,name])=>field(name,key,0,2147483647)).join("")}</fieldset>
      <fieldset><legend>Schadensübersicht</legend>
      ${checkbox("Zeitstempel anzeigen","timestamps",true)}
      <div class="ucurifunke-energy-table"><table><thead><tr><th>Quelle</th><th>Ursprünglich</th><th>Verbleibend</th><th>Wunde?</th><th data-timestamp>Zeitpunkt</th></tr></thead>
      <tbody>${history.map((row,i)=>`<tr><td>${escapeHtml(row.source)}</td><td>${row.original}</td>
        <td><input aria-label="Verbleibender Schaden, Eintrag ${i+1}" type="number" name="damage${i}" required min="0" max="${row.original}" step="1" value="${row.remaining}"></td>
        <td data-wound="${i}">${isWound(row,threshold)?"Ja":"Nein"}</td><td data-timestamp>${escapeHtml(date(row.timestamp))}</td></tr>`).join("")}</tbody></table></div></fieldset></div>`,
    modal:true,rejectClose:false,
    render:(_event,dialog)=>{
      const root=dialog.element;
      const refresh=()=>{
        let damage=0;
        history.forEach((row,i)=>{
          const remaining=root.querySelector(`[name=damage${i}]`).valueAsNumber || 0;
          damage+=remaining;
          root.querySelector(`[data-wound="${i}"]`).textContent=isWound({...row,remaining},threshold)?"Ja":"Nein";
        });
        for(const key of Object.keys(DAMAGE_SOURCES))damage+=root.querySelector(`[name=${key}]`).valueAsNumber || 0;
        root.querySelector("[data-current-le]").textContent=le.max-damage;
        root.querySelectorAll("[data-timestamp]").forEach(el=>el.hidden=!root.querySelector("[name=timestamps]").checked);
      };
      root.addEventListener("input",refresh);
    },
    ok:{label:"Schaden übernehmen",callback:submit}
  });
  if (!result) return;
  assertUnchanged(actor,snapshot);
  const timestamp=new Date().toISOString();
  const damage=[...history.map((row,i)=>({...row,remaining:result["damage"+i]})),...Object.entries(DAMAGE_SOURCES).map(([key,source])=>
    ({source,original:result[key],remaining:result[key],timestamp}))].filter(row=>row.remaining>0);
  le.value=le.max-damage.reduce((sum,row)=>sum+row.remaining,0);
  await actor.update({"system.energies":energies,"system.damage":damage});
}

export async function openEnergyValue(actor,key) {
  if (!actor.isOwner || !["AE","KE"].includes(key)) return;
  const snapshot=JSON.stringify(actor.system.toObject());
  const energies=energyRows(actor.system);
  const row=energies.find(entry=>entry.key===key);
  if (!row) return;
  const result=await DialogV2.prompt({classes:SYSTEM_DIALOG_CLASSES,window:{title:key+" ändern"},
    content:`<div>${field("Aktueller Wert", "value",row.value,row.max)}</div>`,modal:true,rejectClose:false,
    ok:{label:"Speichern",callback:submit}});
  if (!result) return;
  assertUnchanged(actor,snapshot);
  row.value=result.value;
  await actor.update({"system.energies":energies});
}

const camp=["Im Freien, ungeschützt","Höhle, Bäume oder Ruine","Gebäude, geteilter Schlafsaal","Einzelzimmer oder eigenes Heim"];
const bed=["Kein echtes Nachtlager","Schlafsack oder zwei Decken","Zelt, Bodenmatte und Decke","Richtiges Bett, Decke und Kissen"];
const select=(label,name,options)=>`<label class="ucurifunke-energy-field"><span>${label}</span><select name="${name}">
  ${options.map((text,i)=>`<option value="${i}">${i} – ${text}</option>`).join("")}</select></label>`;

export async function openRegeneration(actor) {
  if (!actor.isOwner) return;
  const data=actor.system, snapshot=JSON.stringify(data.toObject());
  const energies=energyRows(data);
  const has=key=>energies.some(row=>row.key===key);
  const defaults=regenerationDefaults(data);
  const box=(label,name)=>checkbox(label,name,defaults[name]);
  const result=await DialogV2.prompt({
    classes:[...SYSTEM_DIALOG_CLASSES,"ucurifunke-energy-dialog"], window:{title:"Regeneration nach täglicher Ruhephase"},
    position:{width:650}, modal:true,rejectClose:false,
    content:`<div>
      <fieldset><legend>Ruhephase</legend>${select("Lagerplatz","camp",camp)}${select("Nachtlager","bed",bed)}
        ${field("Ruhezeit (Stunden)", "restHours",defaults.restHours)}
        <small>${defaults.restHours ? "Benötigt " + defaults.restHours + " Stunden" : "Nicht-Schläfer II: kein Schlaf erforderlich"}</small>
        ${box("Ruhephase unterbrochen","interrupted")}
        ${defaults.nonSleeper===1?box("Schlaf muss noch nachgeholt werden (Nicht-Schläfer I)","sleepDebt"):""}
        ${box("Krank – natürliche LE- und AE-Regeneration entfällt","sick")}</fieldset>
      ${has("LE")?`<fieldset><legend>Lebensenergie</legend>${box('Schnelle Heilung <span data-fast></span>',"fastHealing")}
        ${box("Schlafstörung (−1 LE)","sleepDisorder")}
        ${box("LE-Regeneration trotz Krankheit erlaubt (z. B. durch Perainepflege)","healDespiteSickness")}
        ${field("Zusätzliche LE durch Behandlung oder andere Effekte","additionalLE")}
        ${box("LE nicht regenerieren","preventLE")}<output data-preview="LE"></output></fieldset>`:""}
      ${has("AE")?`<fieldset><legend>Astralenergie</legend>${field("Astrale Regeneration (Stufe)","astralRegenerationLevel",Math.min(6,defaults.astralRegenerationLevel??0),6)}
        ${box("30 Minuten vorher meditiert","meditated")}${box("Kraftlinienmagie nutzen","useLeyLines")}
        ${field("Stärke der Kraftlinie / des Knotens","leyLineStrength",0,3)}
        ${box("Bann des Eisens wirkte länger als eine Stunde","ironExposure")}
        ${box("Bann des Eisens wirkt während der Ruhephase","ironDuringRest")}
        ${box("Metallaffiner Zauberer","metalAffinity")}${box("Schwerer Bann des Eisens","severeIronBan")}
        ${box("AE nicht regenerieren","preventAE")}<output data-preview="AE"></output></fieldset>`:""}
      ${has("KE")?`<fieldset><legend>Karmaenergie</legend>${field("Weihegrad","ordinationRank",Math.min(5,defaults.ordinationRank),5,1)}
        ${defaults.penance?"<small>Bußqueste vorhanden. Nur bei unzureichender Erfüllung die göttliche Sperre aktivieren.</small>":""}
        ${box("Göttliche Sperre der KE-Regeneration","divineBlock")}
        ${field("KE-Rückerstattung für misslungene Wunder","karmaRefund")}
        <small>Rückerstattungen bleiben auch bei gesperrter KE-Regeneration erhalten.</small>
        ${box("KE nicht regenerieren","preventKE")}<output data-preview="KE"></output></fieldset>`:""}
    </div>`,
    render:(_event,dialog)=>{
      const root=dialog.element;
      const refresh=()=>{
        const report=regenerationAmounts(data,submit(null,{form:root.querySelector("form") ?? root}));
        const fast=root.querySelector("[data-fast]");
        if(fast)fast.textContent="(+"+report.fast+" LE)";
        for(const node of root.querySelectorAll("[data-preview]")){
          const key=node.dataset.preview;
          const detail=key==="KE"?` ${report.naturalKE} KE · Rückerstattung: ${report.refund} KE`:` ${report.amounts[key]} ${key}`;
          node.textContent="Regeneration:"+detail+" · Gutschrift: "+report.gains[key]+" "+key;
        }
      };
      root.addEventListener("input",refresh);
      refresh();
    },
    ok:{label:"Regeneration anwenden",callback:submit}
  });
  if(!result)return;
  assertUnchanged(actor,snapshot);
  const updated=regenerate(data,result);
  await actor.update({"system.energies":updated.energies,"system.damage":updated.damage});
}
