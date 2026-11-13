const SPECIALIZATION_SEPARATOR = " – ";
const MUNDANE_GROUPS = new Set(["Körper", "Gesellschaft", "Natur", "Wissen", "Handwerk"]);
const PRIMARY_KEYS = new Set(["MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"]);
const SECONDARY_CHECKS = { GMR: ["MU", "KL", "IN"], KMR: ["GE", "KO", "KK"], RE: ["MU", "IN", "GE"] };

function isPrimary(attribute) {
  return attribute.kind ? attribute.kind === "primary" : PRIMARY_KEYS.has(attribute.key.toUpperCase());
}

export function perceptionCheck(data, keys = ["KL", "IN", "IN"]) {
  const value = data.derived.find(row => row.key.toUpperCase() === "WA")?.value;
  const attributes = keys.map(key => data.attributes.find(row => isPrimary(row) && row.key.toUpperCase() === key));
  if (!Number.isFinite(value) || attributes.length !== 3 || !attributes.every(Boolean)) return null;
  return { kind: "skill", name: "Wahrnehmung", value: Math.round(value), attributes };
}

export function perceptionAttributes(attributes) {
  return attributes.filter(isPrimary);
}

export function astralSenseCheck(data) {
  const value = data.derived.find(row => row.key.toUpperCase() === "AS" || row.name === "Astralsinn")?.value;
  return Number.isFinite(value) && value > 0 ? { kind: "attribute", name: "Astralsinn", value: Math.round(value) } : null;
}

export function attributeCheck(attributes, index) {
  const attribute = attributes[index];
  if (!attribute) return null;
  if (isPrimary(attribute)) return { kind: "attribute", name: attribute.name, key: attribute.key, value: attribute.value };
  const keys = SECONDARY_CHECKS[attribute.key.toUpperCase()];
  const related = keys?.map(key => attributes.find(row => isPrimary(row) && row.key.toUpperCase() === key));
  if (!related?.every(Boolean)) return null;
  return { kind: "skill", name: attribute.name, key: attribute.key, value: attribute.value, attributes: related };
}

export function groupAttributes(attributes) {
  const groups = [{ name: "Primäre Attribute", rows: [] }, { name: "Sekundäre Attribute", rows: [] }];
  for (const [index, attribute] of attributes.entries()) {
    groups[isPrimary(attribute) ? 0 : 1].rows.push({
      name: attribute.name, key: attribute.key, value: attribute.value, index, rollable: Boolean(attributeCheck(attributes, index))
    });
  }
  return groups.filter(group => group.rows.length);
}

function specializationRoot(skills, index) {
  const skill = skills[index];
  if (!MUNDANE_GROUPS.has(skill.group)) return undefined;
  // Pedipalpus exports each complex skill directly before its specializations.
  return skills.slice(0, index).find(row => row.group === skill.group &&
    skill.name.startsWith(row.name + SPECIALIZATION_SEPARATOR));
}

export function skillCheck(skills, index) {
  const skill = skills[index];
  if (!skill?.rollable || skill.attributes.length !== 3) return null;
  const root = specializationRoot(skills, index);
  const name = root ? skill.name.slice(root.name.length + SPECIALIZATION_SEPARATOR.length)
    : ["Hobby", "Zauber", "Wunder"].includes(skill.group) || (skill.group === "Rituale" && skill.rollName)
      ? skill.name : "";
  return name ? { ...skill, kind: "skill", name: skill.rollName || name } : null;
}

export function groupSkills(skills) {
  const groups = new Map();
  for (const [index, skill] of skills.entries()) {
    const group = skill.group || "Weitere Fertigkeiten";
    if (!groups.has(group)) groups.set(group, { name: group, rows: [] });
    const rows = groups.get(group).rows;
    const root = specializationRoot(skills, index);
    rows.push({
      ...skill,
      index,
      label: root ? skill.name.slice(root.name.length + SPECIALIZATION_SEPARATOR.length) : skill.name,
      specialization: Boolean(root),
      parentName: root?.name,
      rollable: Boolean(skillCheck(skills, index)),
      attributeLabel: skill.attributes.map(attribute => attribute.key || attribute.name).join(" · ")
    });
  }
  return [...groups.values()];
}

export function partitionSkills(skills, companion = false, npc = false) {
  const groups = groupSkills(skills);
  if (companion) return { combatGroups: [], skillTabs: [{ id: "abilities", label: "Fähigkeiten", icon: "fa-book-open",
    groups: groups.map(group => ({ ...group, rows: group.rows.map(row => ({ ...row, companionAbility: true })) })) }] };
  if (npc) {
    const select = names => groups.filter(group => names.includes(group.name)).map(group => ({
      ...group, rows: group.rows.map(row => ({ ...row, rollable: false, companionAbility: skills[row.index].rollable }))
    }));
    return {
      combatGroups: groups.filter(group => ["Nahkampf", "Fernkampf"].includes(group.name)),
      skillTabs: [
        { id: "munda", label: "Mundan", icon: "fa-book-open", groups: select(["Aufgabenbereiche"]) },
        { id: "magic", label: "Magie", icon: "fa-wand-sparkles", groups: select(["Merkmale", "Zauber", "Rituale"]) },
        { id: "clerical", label: "Klerikal", icon: "fa-sun", groups: select(["Liturgien"]) }
      ]
    };
  }
  const select = (names, keepParents = false) => groups.filter(group => names.includes(group.name))
    .map(group => {
      const rollable = group.rows.filter(row => row.rollable);
      const parents = new Set(rollable.map(row => row.parentName).filter(Boolean));
      const rows = keepParents ? group.rows.filter(row => row.rollable || parents.has(row.name)) : rollable;
      return { ...group, rows };
    }).filter(group => group.rows.length > 0);
  return {
    combatGroups: groups.filter(group => ["Nahkampf", "Fernkampf"].includes(group.name)).map(group => ({
      ...group, rows: group.rows.map(row => ({ ...row, technique: true, ranged: group.name === "Fernkampf" }))
    })),
    skillTabs: [
      { id: "munda", label: "Mundan", icon: "fa-book-open", groups: select([...MUNDANE_GROUPS, "Hobby"], true) },
      { id: "magic", label: "Magie", icon: "fa-wand-sparkles", groups: select(["Zauber", "Rituale"]) },
      { id: "clerical", label: "Klerikal", icon: "fa-sun", groups: select(["Wunder"]) }
    ]
  };
}

export function groupItems(items) {
  const groups = new Map();
  for (const item of items) {
    const group = item.data.group || "Sonstige Ausrüstung";
    if (!groups.has(group)) groups.set(group, { name: group, rows: [] });
    groups.get(group).rows.push(item);
  }
  return [...groups.values()];
}

function normalizeSearch(text) {
  return text.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("ß", "ss");
}

export function filterSheet(panel, query, category = "") {
  const terms = normalizeSearch(query).trim().split(/\s+/u).filter(Boolean);
  let visible = 0;
  for (const group of panel.querySelectorAll("[data-filter-group]")) {
    let matches = 0;
    const inCategory = !category || group.dataset.filterGroup === category;
    for (const row of group.querySelectorAll("[data-filter-row]")) {
      const label = row.dataset.filterRow.toLocaleLowerCase("de");
      const transliterated = label.replace(/[äöü]/g, letter => ({ ä: "ae", ö: "oe", ü: "ue" })[letter]);
      const text = normalizeSearch(label + " " + transliterated);
      const show = inCategory && terms.every(term => text.includes(term));
      row.hidden = !show;
      if (show) matches++;
    }
    group.hidden = matches === 0;
    visible += matches;
  }
  panel.querySelector("[data-no-results]").hidden = visible > 0;
}
