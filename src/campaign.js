import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { escapeHtml } from "./check-card.js";
import { MONTHS, WEEKDAYS, ERAS, daysInMonth, weekday, dateKey, eraYear, validDate, monthShift, holidays } from "./aventurian-calendar.js";

const scope = "ucurifunke";
const read = key => game.settings.get(scope, key);
const save = (key, value) => game.settings.set(scope, key, value);
const esc = escapeHtml;
const formatDate = (date, era) => date.day + ". " + MONTHS[date.month] + " " + eraYear(date.year, era) + " " + era;
const stamp = value => new Date(value).toLocaleString("de-DE");
const selected = (value, expected) => value === expected ? " selected" : "";
const notes = () => game.users.contents.flatMap(user => Object.entries(user.getFlag(scope, "calendarNotes") ?? {})
  .filter(([, note]) => note && typeof note.text === "string")
  .map(([id, note]) => ({ ...note, id, userId: user.id, author: user.name })));

Hooks.once("init", () => {
  game.settings.register(scope, "partyExperience", { scope: "world", config: false, type: Array, default: [], onChange: () => experience?.refresh() });
  game.settings.register(scope, "calendarDate", { scope: "world", config: false, type: Object,
    default: { year: 1040, month: 0, day: 1 }, onChange: () => calendar?.refresh() });
  game.settings.register(scope, "calendarDisplay", { scope: "user", config: false, type: Object,
    default: { era: "BF", weekdays: "aventurian" }, onChange: () => calendar?.refresh() });
});
Hooks.on("updateUser", (_user, changes) => {
  if (changes.flags?.ucurifunke?.calendarNotes || changes.name) calendar?.refresh();
});

const { DialogV2 } = foundry.applications.api;
class CampaignWindow extends DialogV2 {
  constructor(title, width, render, bind) {
    super({ classes: [...SYSTEM_DIALOG_CLASSES, "ucurifunke-campaign-window"], window: { title, resizable: true },
      position: { width }, content: '<div><div data-campaign-view></div></div>',
      buttons: [{ action: "close", label: "Schließen" }] });
    this.draw = render;
    this.bindView = bind;
  }
  _onRender(context, options) {
    super._onRender(context, options);
    const view = this.element.querySelector("[data-campaign-view]");
    if (view !== this.view) this.bindView(view);
    this.view = view;
    this.refresh();
  }
  refresh() {
    if (!this.view?.isConnected) return;
    const note = this.view.querySelector('[name="note"]')?.value;
    this.view.innerHTML = this.draw();
    if (note) this.view.querySelector('[name="note"]').value = note;
  }
}

let experience, calendar, viewed, picked;
function openExperience() {
  if (experience?.rendered) return experience.bringToFront();
  experience = new CampaignWindow("Abenteuerpunkte", 660, () => {
    const entries = read("partyExperience");
    const history = entries.map((entry, index) => `<tr><td>${esc(entry.reason)}</td><td>${entry.amount}</td><td>${esc(stamp(entry.at))}</td>
      ${game.user.isGM ? `<td><div class="ucurifunke-ap-actions">
        <button type="button" data-ap="edit" data-index="${index}" aria-label="AP-Eintrag bearbeiten"><i class="fa-solid fa-pencil" aria-hidden="true"></i></button>
        <button type="button" data-ap="delete" data-index="${index}" aria-label="AP-Eintrag löschen"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </div></td>` : ""}</tr>`).join("");
    return `<p><strong>${entries.reduce((sum, entry) => sum + entry.amount, 0)} erspielte AP</strong></p>
      <div class="ucurifunke-ap-layout ${game.user.isGM ? "can-edit" : ""}">
      ${game.user.isGM ? '<fieldset><legend>Änderung</legend><label>Anlass <textarea name="reason" required maxlength="300" rows="2"></textarea></label><label>Menge <input type="number" name="amount" min="-1000000" max="1000000" step="1" value="100" required></label><button type="button" data-add-ap>Hinzufügen</button></fieldset>' : ""}
      <fieldset><legend>Historie</legend>${history ? '<div class="ucurifunke-ap-history"><table><thead><tr><th>Anlass</th><th>Menge</th><th>Datum</th>'
        + (game.user.isGM ? '<th>Aktionen</th>' : '') + '</tr></thead><tbody>' + history + '</tbody></table></div>' : "<p>Noch keine Einträge.</p>"}</fieldset></div>`;
  }, view => {
    view.addEventListener("click", async event => {
      const button = event.target.closest("[data-add-ap], [data-ap]");
      if (!button || !game.user.isGM || button.disabled) return;
      if (button.dataset.ap) {
        button.disabled = true;
        try { await changeExperience(button.dataset.ap, Number(button.dataset.index)); }
        catch (error) { ui.notifications.error(error.message); }
        finally { button.disabled = false; }
        return;
      }
      const reason = experience.view.querySelector('[name="reason"]');
      const amount = experience.view.querySelector('[name="amount"]');
      if (!reason.value.trim() || !amount.reportValidity() || !amount.valueAsNumber) {
        ui.notifications.warn("Bitte einen Anlass und eine Menge ungleich 0 eingeben.");
        return;
      }
      button.disabled = true;
      try {
        await save("partyExperience", [...read("partyExperience"), { reason: reason.value.trim(), amount: amount.valueAsNumber, at: Date.now() }]);
      } catch (error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
  });
  return experience.render({ force: true });
}

async function changeExperience(action, index) {
  const entries = read("partyExperience");
  const entry = entries[index];
  if (!entry || !game.user.isGM) return;
  const dialog = { classes: [...SYSTEM_DIALOG_CLASSES, "ucurifunke-campaign-window"], modal: true, rejectClose: false };
  let replacement;
  if (action === "delete") {
    if (!await DialogV2.confirm({ ...dialog, window: { title: "AP-Eintrag löschen" },
      content: `<p>„${esc(entry.reason)}“ (${entry.amount} AP) löschen?</p>`, yes: { label: "Löschen" } })) return;
  } else if (action === "edit") {
    const result = await DialogV2.input({ ...dialog, window: { title: "AP-Eintrag bearbeiten" },
      content: `<div class="ucurifunke-ap-edit"><label>Anlass<textarea name="reason" rows="3" required maxlength="300">${esc(entry.reason)}</textarea></label>
        <label>Menge<input type="number" name="amount" min="-1000000" max="1000000" step="1" required value="${entry.amount}"></label></div>`,
      ok: { label: "Speichern" } });
    if (!result) return;
    const reason = result.reason?.trim();
    const amount = Number(result.amount);
    if (!reason || reason.length > 300 || !Number.isSafeInteger(amount) || !amount || Math.abs(amount) > 1000000) {
      throw new Error("Bitte einen Anlass und eine ganze Menge ungleich 0 eingeben.");
    }
    replacement = { ...entry, reason, amount };
  } else return;
  if (!game.user.isGM) return;
  const latest = read("partyExperience");
  if (JSON.stringify(latest[index]) !== JSON.stringify(entry) ||
      JSON.stringify(latest.slice(0, index)) !== JSON.stringify(entries.slice(0, index))) {
    throw new Error("Die AP-Historie wurde inzwischen geändert. Bitte erneut versuchen.");
  }
  const updated = [...latest];
  updated.splice(index, 1, ...(replacement ? [replacement] : []));
  await save("partyExperience", updated);
}

function drawCalendar() {
  const current = read("calendarDate");
  const { era, weekdays } = read("calendarDisplay");
  const allNotes = notes();
  const dayNotes = allNotes.filter(note => note.date === dateKey(picked));
  const holidayList = holidays(picked);
  const days = Array.from({length: daysInMonth(viewed.month)}, (_, i) => {
    const date = { ...viewed, day: i + 1 };
    const key = dateKey(date);
    const active = key === dateKey(current);
    const festival = holidays(date);
    const annotated = allNotes.some(note => note.date === key);
    return `<button type="button" data-calendar-day="${date.day}" aria-pressed="${key === dateKey(picked)}"
      ${active ? 'aria-current="date"' : ""} title="${esc([formatDate(date, era), ...festival, ...(annotated ? ["Notizen vorhanden"] : [])].join(" · "))}">
      ${date.day}${festival.length ? '<span aria-hidden="true">◆</span>' : ""}${annotated ? '<i class="fa-solid fa-note-sticky ucurifunke-calendar-note-icon" aria-hidden="true"></i>' : ""}</button>`;
  }).join("");
  return `<div class="ucurifunke-calendar-toolbar">
    <button type="button" data-calendar="prev" aria-label="Voriger Monat">‹</button>
    <select name="month" aria-label="Monat">${MONTHS.map((m,i) => `<option value="${i}"${selected(i,viewed.month)}>${m}</option>`).join("")}</select>
    <input type="number" name="year" aria-label="Jahr ${esc(era)}" value="${eraYear(viewed.year,era)}" step="1">
    <span>${esc(era)}</span><button type="button" data-calendar="next" aria-label="Nächster Monat">›</button>
    <button type="button" data-calendar="settings" aria-label="Kalendereinstellungen"><i class="fa-solid fa-gear"></i></button>
  </div>
  <button type="button" data-calendar="today">Aktuell: ${esc(formatDate(current,era))}</button>
  <div class="ucurifunke-calendar-grid">
    ${(WEEKDAYS[weekdays] ?? WEEKDAYS.aventurian).map(name => `<abbr title="${name}">${name.slice(0,2)}</abbr>`).join("")}
    ${"<span></span>".repeat(weekday({...viewed,day:1}))}${days}
  </div>
  <h3>${esc(formatDate(picked,era))}</h3>
  ${holidayList.length ? "<p>◆ " + esc(holidayList.join(" · ")) + "</p>" : ""}
  ${dayNotes.map(note => `<article class="ucurifunke-calendar-note">
    <div><strong>${esc(note.author)}</strong> <small>${esc(stamp(note.at))}</small>
    ${game.user.isGM || note.userId === game.user.id ? `<span class="ucurifunke-note-actions">
      <button type="button" data-calendar="edit" data-user="${esc(note.userId)}" data-note="${esc(note.id)}" aria-label="Notiz bearbeiten"><i class="fa-solid fa-pencil"></i></button>
      <button type="button" data-calendar="delete" data-user="${esc(note.userId)}" data-note="${esc(note.id)}" aria-label="Notiz löschen"><i class="fa-solid fa-trash"></i></button>
    </span>` : ""}</div><p>${esc(note.text)}</p></article>`).join("")}
  <label class="ucurifunke-note-compose">Tagesnotiz <textarea name="note" rows="3" maxlength="2000"></textarea></label>
  <div class="ucurifunke-calendar-toolbar">
    <button type="button" data-calendar="note">Notiz hinzufügen</button>
    ${game.user.isGM ? '<button type="button" data-calendar="current">Als aktuelles Datum setzen</button>' : ""}
  </div>`;
}
async function calendarSettings() {
  const prefs = read("calendarDisplay");
  const options = (choices, value) => Object.entries(choices).map(([key,label]) =>
    `<option value="${key}"${selected(key,value)}>${label}</option>`).join("");
  const result = await DialogV2.input({ classes:SYSTEM_DIALOG_CLASSES, window:{title:"Kalendereinstellungen"},
    content:`<div><label>Zeitrechnung <select name="era">${options({BF:"Bosparans Fall (BF)",Hal:"nach Hal"},prefs.era)}</select></label>
    <label>Wochentage <select name="weekdays">${options({aventurian:"Aventurisch",earthly:"Irdisch"},prefs.weekdays)}</select></label></div>`,
    modal:true,rejectClose:false,ok:{label:"Speichern"} });
  if (result && Object.hasOwn(ERAS,result.era) && Object.hasOwn(WEEKDAYS,result.weekdays)) await save("calendarDisplay",result);
}
async function changeNote(action, { user: userId, note: id }) {
  if (!/^[a-zA-Z0-9]+$/.test(id ?? "") || (!game.user.isGM && userId !== game.user.id)) return;
  const user = game.users.get(userId);
  const note = user?.getFlag(scope, "calendarNotes")?.[id];
  if (!note) return;
  const path = "flags.ucurifunke.calendarNotes.";
  const app = { classes: [...SYSTEM_DIALOG_CLASSES, "ucurifunke-campaign-window"], modal: true, rejectClose: false };
  if (action === "delete") {
    const confirmed = await DialogV2.confirm({ ...app, window: { title: "Notiz löschen" },
      content: "<p>Soll diese Tagesnotiz gelöscht werden?</p>", yes: { label: "Löschen" } });
    if (confirmed) await user.update({ [path + "-=" + id]: null });
    return;
  }
  const result = await DialogV2.input({ ...app, window: { title: "Notiz bearbeiten" },
    content: `<div><label class="ucurifunke-note-compose">Tagesnotiz<textarea name="text" rows="4" required maxlength="2000">${esc(note.text)}</textarea></label></div>`,
    ok: { label: "Speichern" } });
  const text = result?.text?.trim();
  if (!text || text.length > 2000) return;
  const current = user.getFlag(scope, "calendarNotes")?.[id];
  if (!current || current.text !== note.text) throw new Error("Die Notiz wurde inzwischen geändert. Bitte erneut öffnen.");
  await user.update({ [path + id + ".text"]: text });
}
function openCalendar() {
  if (calendar?.rendered) return calendar.bringToFront();
  picked = viewed = read("calendarDate");
  calendar = new CampaignWindow("Aventurischer Kalender", 530, drawCalendar, view => {
    const navigate = date => { if (validDate(date)) { picked = viewed = date; calendar.refresh(); } };
    view.addEventListener("change", event => {
      const era = read("calendarDisplay").era;
      if (event.target.name === "year") navigate({ ...viewed, year: event.target.valueAsNumber + ERAS[era], day: 1 });
      if (event.target.name === "month") navigate({ ...viewed, month: Number(event.target.value), day: 1 });
    });
    view.addEventListener("click", async event => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.dataset.calendarDay) { navigate({ ...viewed, day: Number(button.dataset.calendarDay) }); return; }
      const action = button.dataset.calendar;
      button.disabled = true;
      try {
        if (action === "prev" || action === "next") navigate(monthShift(viewed,action === "prev" ? -1 : 1));
        if (action === "today") navigate(read("calendarDate"));
        if (action === "settings") await calendarSettings();
        if (action === "edit" || action === "delete") await changeNote(action, button.dataset);
        if (action === "current" && game.user.isGM) await save("calendarDate",picked);
        if (action === "note") {
          const text = view.querySelector('[name="note"]').value.trim();
          if (!text || text.length > 2000) return;
          const entry = { date: dateKey(picked), text, at: Date.now() };
          await game.user.update({ ["flags.ucurifunke.calendarNotes." + foundry.utils.randomID()]: entry });
          const draft = view.querySelector('[name="note"]');
          if (draft.value.trim() === text) draft.value = "";
        }
      } catch (error) { ui.notifications.error(error.message); }
      finally { button.disabled = false; }
    });
  });
  return calendar.render({force:true});
}

const shortcuts = [
  { id:"ucurifunkeAP", title:"Abenteuerpunkte", icon:"fa-solid fa-arrow-up", open:openExperience },
  { id:"ucurifunkeCalendar", title:"Aventurischer Kalender", icon:"fa-solid fa-calendar-days", open:openCalendar }
];
Hooks.on("getSceneControlButtons", controls => {
  const order = Math.max(-1, ...Object.values(controls)
    .filter(control => control.name !== "ucurifunkeDice").map(control => control.order)) + 1;
  shortcuts.forEach(({id,title,icon,open},i) => {
    controls[id] = { name:id,title,icon,order:order+i,
      tools:{open:{name:"open",title,icon,order:0,button:true,onChange:open}} };
  });
  if (controls.ucurifunkeDice) controls.ucurifunkeDice.order = order + shortcuts.length;
});
Hooks.on("renderSceneControls", (_app,html) => {
  for (const {id,open} of shortcuts) html.querySelector(`button[data-control="${id}"]`)?.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    void open();
  }, {capture:true});
});
