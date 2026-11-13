export function escapeHtml(text) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(text).replace(/[&<>"']/g, char => entities[char]);
}

export function medianDie(dice) {
  return dice.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)[1];
}

export function skillDice(check, dice, target) {
  const residual = Math.max(0, -target);
  return dice.map((roll, index) => {
    const base = check.attributes[index].value;
    const threshold = base - residual;
    return { base, threshold, roll, difference: Math.max(0, roll - threshold) };
  });
}

const signed = value => value > 0 ? "+" + value : String(value);

function renderAttribute(check, dice, net) {
  const median = medianDie(dice);
  const values = dice.map((die, index) =>
    `<span class="ucurifunke-card-die${index === median.index ? " is-selected" : ""}">W${index + 1}: <strong>${die}</strong>${index === median.index ? " <em>(Median)</em>" : ""}</span>`).join("");
  return {
    summary: `Attribut: <strong>${check.value}${net ? " → " + (check.value + net) : ""}</strong>`,
    detail: `<div class="ucurifunke-card-dice">${values}</div><div>Gewertet: W${median.index + 1} mit ${median.value}</div>`
  };
}

function renderSkill(check, dice, net) {
  const target = check.value + net;
  const effective = Math.max(0, target);
  const rows = skillDice(check, dice, target).map(({ base, threshold, roll, difference }, index) =>
    `<tr><th scope="row">W${index + 1}</th><td>${base}${base !== threshold ? " → " + threshold : ""}</td>
      <td><strong>${roll}</strong></td><td>${difference ? "−" + difference : 0}</td></tr>`).join("");
  const attributes = check.attributes.map(attribute => attribute.value).join(" / ");
  return {
    summary: `Probenwert: <strong>${check.value}${effective !== check.value ? " → " + effective : ""}</strong>
      <span>Attribute: <strong>${attributes}</strong></span>`,
    detail: `${target < 0 ? `<div>Resterschwernis auf alle Attribute: <strong>${-target}</strong></div>` : ""}
      <table class="ucurifunke-card-table"><thead><tr><th></th><th>Attribut</th><th>Wurf</th><th>Differenz</th></tr></thead>
      <tbody>${rows}</tbody></table>`
  };
}

function renderCombat(check, dice, modifiers, confirmation) {
  const { weapon, technique, breakdown = [], impairment = 0, joints = 0, mode } = check;
  const target = check.value + modifiers.bonus - modifiers.penalty;
  const labels = [check.title ? "Ausweichwert" : "Fertigkeitswert", check.title ? null : { AT: "Offensive Basis", PA: "Defensive Basis", FK: "Fernkampf-Basis" }[mode],
    { AT: "Offensiver Fokus", PA: "Defensiver Fokus" }[mode], weapon ? "Waffenmodifikator" : "Bonus"];
  const rows = breakdown.length === 4
    ? breakdown.flatMap((value, index) => labels[index] ? [[labels[index], value]] : [])
    : [[check.attackName ? "Hinterlegter Probenwert" : "Basiswert inkl. Waffe",
      check.value + impairment + joints - (check.focusDelta ?? 0) + (check.conditionPenalties ?? [])
      .reduce((sum, entry) => sum + entry.value, 0)]];
  rows.push(["Beeinträchtigung", -impairment]);
  for (const [name, value] of check.penalties ?? []) rows.push([escapeHtml(name), -value]);
  if (check.opposedQuality != null) rows.push(["Angriffsqualität", check.opposedQuality]);
  if (check.focusDelta) rows.push(["Kampffokus", check.focusDelta]);
  if (joints) rows.push(["Schlechte Gelenke", -joints]);
  for (const { name, value } of check.conditionPenalties ?? []) rows.push([escapeHtml(name), -value]);
  rows.push(["Erschwernis", -modifiers.penalty], ["Erleichterung", modifiers.bonus]);
  const parts = rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${signed(value)}</dd></div>`).join("");
  return {
    summary: [weapon && `Waffe: <strong>${escapeHtml(weapon)}</strong>`,
      check.attackName && `Angriff: <strong>${escapeHtml(check.attackName)}</strong>`,
      technique && `Fertigkeit: <strong>${escapeHtml(technique)}</strong>`,
      check.targetName && `Ziel: <strong>${escapeHtml(check.targetName)}</strong>`,
      check.bookedTicks != null && `Gebuchte Ticks: <strong>${check.bookedTicks}</strong>`,
      check.ticks != null && check.bookedTicks == null && `Tickkosten: <strong>${check.ticks}</strong>`].filter(Boolean).join("<br>"),
    detail: `<dl class="ucurifunke-card-breakdown">${parts}<div class="ucurifunke-card-target"><dt>Probenwert</dt><dd>${target}</dd></div></dl>
      <div class="ucurifunke-card-dice"><span class="ucurifunke-card-die is-selected">W20: <strong>${dice[0]}</strong></span>
      ${confirmation == null ? "" : `<span class="ucurifunke-card-die">Bestätigung: <strong>${confirmation}</strong></span>`}</div>`
  };
}

export function renderCheckCard(check, dice, modifiers, result, confirmation) {
  const net = modifiers.bonus - modifiers.penalty;
  const combat = check.kind === "combat";
  const title = combat ? check.title ?? { AT: "Angriff", PA: "Parade", FK: "Fernkampfangriff" }[check.mode]
    : check.kind === "attribute" ? `Attributsprobe: <strong>${escapeHtml(check.name)}</strong>`
      : `Fertigkeitsprobe: <strong>${escapeHtml(check.name)}</strong>`;
  const { summary, detail } = combat ? renderCombat(check, dice, modifiers, confirmation)
    : check.kind === "attribute" ? renderAttribute(check, dice, net) : renderSkill(check, dice, net);
  const outcome = result.critical ? "Kritischer Erfolg" : result.fumble ? "Patzer" : result.success ? "Gelungen" : "Misslungen";
  return `<article class="ucurifunke-check-card">
    <header>${title}</header>
    <div class="ucurifunke-card-summary">${summary}</div>
    ${combat ? "" : `<div>Erschwernis: <strong>${modifiers.penalty}</strong> · Erleichterung: <strong>${modifiers.bonus}</strong> · Netto: <strong>${signed(net)}</strong></div>`}
    ${!combat && check.conditionPenalties?.length ? `<div>Zustandsabzüge: ${check.conditionPenalties
      .map(({ name, value }) => escapeHtml(name) + " −" + value).join(" · ")}</div>` : ""}
    ${detail}
    <footer><span>Qualität: <strong>${result.quality}</strong></span>
      <strong class="ucurifunke-card-outcome${result.success ? " is-success" : ""}">${outcome}</strong></footer>
  </article>`;
}
