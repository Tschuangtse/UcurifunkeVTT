import { CATEGORIES } from "./actions/actions.js";

export const CHECK_CATEGORIES = [
  ["physical","Körperlich"], ["mental","Geistig"], ["combat","Kampf"], ["mundane","Mundan"],
  ["magic","Magie"], ["divine","Klerikal"], ["attribute","Attribute"], ["skill","Fertigkeiten"],
  ["perception","Wahrnehmung"], ["resistance","Magieresistenz"]
];
export const FILTER_TYPES = { all:"Alles", checkCategory:"Probenkategorie", skillGroup:"Fertigkeitsbereich",
  skillName:"Bestimmte Fähigkeit", attribute:"Verwendetes Attribut", actionCategory:"Handlungskategorie", actionId:"Bestimmte Handlung" };
export const ACTION_CATEGORIES = CATEGORIES.map(row=>[row.id,row.label]);
export const ACTION_FILTERS = [...CATEGORIES.flatMap(category=>category.actions.map(action=>[action.id,action.name])),["complex","Komplexe Handlung"]];
const normalize = value => String(value??"").trim().normalize("NFC").toLocaleLowerCase("de");
export function allowedFilters(target) {
  return target === "actionTicks" ? ["all","actionCategory","actionId"] : ["checkPenalty","checkBonus"].includes(target)
    ? ["all","checkCategory","skillGroup","skillName","attribute"] : ["all"];
}
export function validateFilter(change) {
  const filterType=change.filterType??"all",filterValue=String(change.filterValue??"").trim();
  if (!allowedFilters(change.target).includes(filterType) || filterType!=="all"&&(!filterValue||filterValue.length>120)) throw new Error("Bitte einen passenden Wirkungsfilter auswählen.");
  const choices=filterType==="checkCategory"?CHECK_CATEGORIES:filterType==="actionCategory"?ACTION_CATEGORIES:filterType==="actionId"?ACTION_FILTERS:null;
  if(choices&&!choices.some(([key])=>key===filterValue))throw new Error("Unbekannte Wirkungsfilter-Kategorie.");
  return {filterType,filterValue:filterType==="all"?"":filterValue};
}
export function checkCategories(check) {
  const categories=new Set([check.kind]);const key=String(check.key??"").toUpperCase(),group=normalize(check.group);
  if(check.kind==="combat") {categories.add("combat");categories.add("physical");}
  if(group==="körper"||check.kind==="attribute"&&["FF","GE","KO","KK","KMR","RE"].includes(key)||["KMR","RE"].includes(key)) categories.add("physical");
  if(["zauber","rituale","magische fertigkeiten"].includes(group)) categories.add("magic");
  if(["wunder","liturgien","klerikale fertigkeiten"].includes(group)) categories.add("divine");
  if(["körper","gesellschaft","natur","wissen","handwerk","hobby"].includes(group)) categories.add("mundane");
  if(check.kind==="attribute"&&["MU","KL","IN","CH","GMR"].includes(key)||key==="GMR"||["wissen","gesellschaft"].includes(group)||categories.has("magic")||categories.has("divine")) categories.add("mental");
  if(["GMR","KMR"].includes(key)||normalize(check.name).includes("magieresistenz")) categories.add("resistance");
  if(normalize(check.name)==="wahrnehmung")categories.add("perception");
  return categories;
}
export function matchesCheckFilter(change, check) {
  const wanted=normalize(change.filterValue);
  switch(change.filterType??"all") {
    case "all":return true;
    case "checkCategory":return checkCategories(check).has(change.filterValue);
    case "skillGroup":return normalize(check.group)===wanted;
    case "skillName":return [check.name,check.sourceName,check.technique,check.attackName].some(name=>normalize(name)===wanted||normalize(name).endsWith(" – "+wanted));
    case "attribute":return [check,...check.attributes??[]].some(row=>normalize(row.key)===wanted);
    default:return false;
  }
}
export function matchesActionFilter(change, actionId) {
  const category=actionId==="complex"?"tactical":CATEGORIES.find(category=>category.actions.some(action=>action.id===actionId))?.id;
  return !change.filterType||change.filterType==="all"||change.filterType==="actionId"&&change.filterValue===actionId||change.filterType==="actionCategory"&&change.filterValue===category;
}
