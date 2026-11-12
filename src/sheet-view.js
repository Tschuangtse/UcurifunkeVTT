const SPECIALIZATION_SEPARATOR = " – ";

export function groupSkills(skills) {
  const groups = new Map();
  for (const [index, skill] of skills.entries()) {
    const group = skill.group || "Weitere Fertigkeiten";
    if (!groups.has(group)) groups.set(group, { name: group, rows: [] });
    const rows = groups.get(group).rows;
    const root = rows.find(row => !row.specialization && skill.name.startsWith(row.name + SPECIALIZATION_SEPARATOR));
    rows.push({
      ...skill,
      index,
      label: root ? skill.name.slice(root.name.length + SPECIALIZATION_SEPARATOR.length) : skill.name,
      specialization: Boolean(root),
      attributeLabel: skill.attributes.map(attribute => attribute.key || attribute.name).join(" · ")
    });
  }
  return [...groups.values()];
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
