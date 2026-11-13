import { SYSTEM_DIALOG_CLASSES } from "./appearance.js";
import { CONDITION_CATALOG } from "./condition-catalog.js";
import { conditionKey, conditionRows, setConditionField } from "./conditions.js";

const standardDefaults = ["sleep", "burning", "dead", "poison", "invisible", "prone", "kneeling"];
const german = {
  dead: "Tot", unconscious: "Bewusstlos", sleep: "Schlafend", stun: "Betäubt",
  prone: "Liegend", restrain: "Gefesselt", paralysis: "Paralysiert", fly: "Fliegend",
  blind: "Blind", deaf: "Taub", silence: "Verstummt", fear: "Verängstigt", burning: "Brennend",
  frozen: "Eingefroren", shock: "Unter Strom", corrode: "Verätzt", bleeding: "Blutend",
  disease: "Erkrankt", poison: "Vergiftet", curse: "Verflucht", regen: "Regenerierend",
  degen: "Geschwächt", hover: "Schwebend", burrow: "Eingegraben", upgrade: "Verstärkt",
  downgrade: "Herabgesetzt", invisible: "Unsichtbar", target: "Anvisiert", eye: "Markiert",
  bless: "Gesegnet", fireShield: "Feuerschild", coldShield: "Eisschild", magicShield: "Magieschild",
  holyShield: "Heiliger Schild", kneeling: "Kniend"
};
const conditionIcons = new Map(CONDITION_CATALOG.map(({ Name }) => [conditionKey(Name), Name]));
const defaults = Object.fromEntries([...standardDefaults, ...conditionIcons.keys()].map(id => [id, true]));
const tokenBadges = new WeakMap();
const iconPath = key => "systems/ucurifunke/assets/conditions/" + key + ".svg";
const enabled = () => ({ ...defaults, ...game.settings.get("ucurifunke", "tokenStatuses") });
const statusName = entry => german[entry.id] ?? game.i18n.localize(entry.name);

function refreshBadges(token) {
  if (token.destroyed || token.isPreview || !token.actor) return;
  const settings = enabled();
  const rows = conditionRows(token.actor.system).filter(row => row.effective && settings[row.key] && conditionIcons.has(row.key));
  let badge = tokenBadges.get(token);
  if (!badge || badge.container.destroyed || badge.container.parent !== token) {
    if (!rows.length) return;
    badge = { container: token.addChild(new PIXI.Container()), key: null };
    badge.container.eventMode = "none";
    tokenBadges.set(token, badge);
  }
  const key = JSON.stringify([token.w, token.h, rows.map(row => [row.key, row.effective])]);
  if (badge.key === key) return;
  badge.key = key;
  for (const child of badge.container.removeChildren()) child.destroy({ children: true });
  const size = Math.min(27, token.w / 4, token.h / 4);
  rows.forEach((row, index) => {
    const item = badge.container.addChild(new PIXI.Container());
    item.position.set(token.w - size * (1 + index % 3), size * Math.floor(index / 3));
    const background = item.addChild(new PIXI.Graphics());
    background.lineStyle(1, 0xdab986, 0.95);
    background.beginFill(0x1a131d, 0.93).drawRoundedRect(0, 0, size - 2, size - 2, 4).endFill();
    void PIXI.Assets.load(iconPath(row.key)).then(texture => {
      if (item.destroyed) return;
      const icon = item.addChildAt(new PIXI.Sprite(texture), 1);
      icon.position.set(2, 2);
      icon.width = icon.height = size * .65;
    }).catch(console.warn);
    const label = item.addChild(new PIXI.Text(String(row.effective), {
      fontFamily: "Arial", fontSize: size * .49, fontWeight: "bold", fill: 0xffffff,
      stroke: 0x1a131d, strokeThickness: 3
    }));
    label.anchor.set(1, 1);
    label.position.set(size - 2, size - 1);
  });
}

function refreshTokenStatuses() {
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) refreshBadges(token);
  const hud = globalThis.canvas?.tokens?.hud;
  if (hud?.rendered) decorateHud(hud, hud.element);
}

function conditionButton(actor, row) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ucurifunke-hud-condition";
  button.dataset.conditionKey = row.key;
  button.classList.toggle("active", Boolean(row.staged ? row.level : row.active));
  button.ariaLabel = row.staged ? row.name + ", Stufe " + row.level : row.name;
  button.title = row.staged ? button.ariaLabel + " · Klick erhöht, Rechtsklick oder Minus senkt" : row.name;
  const icon = new Image();
  icon.src = iconPath(row.key);
  icon.alt = "";
  const count = document.createElement("span");
  count.textContent = row.staged ? row.level : row.active ? "1" : "";
  if (row.staged ? row.level !== row.effective : row.active && !row.effective) count.classList.add("suppressed");
  button.append(icon, count);
  const change = async delta => {
    if (button.disabled || !actor.isOwner) return;
    const current = conditionRows(actor.system).find(entry => entry.key === row.key);
    if (!current) return;
    button.disabled = true;
    try {
      const value = row.staged ? Math.max(0, Math.min(current.max, current.level + delta)) : !current.active;
      await setConditionField(actor, row.key, row.staged ? "level" : "active", value);
    } catch (error) { ui.notifications.error(error.message); }
    finally { button.disabled = false; }
  };
  button.onclick = () => void change(1);
  button.oncontextmenu = event => { event.preventDefault(); event.stopPropagation(); if (row.staged) void change(-1); };
  button.onkeydown = event => {
    if (row.staged && ["+", "-"].includes(event.key)) { event.preventDefault(); void change(event.key === "+" ? 1 : -1); }
  };
  return button;
}

function decorateHud(hud, html) {
  html.querySelectorAll('[data-palette="movementActions"]').forEach(el => el.remove());
  const palette = html.querySelector('.status-effects[data-palette="effects"]');
  if (!palette) return;
  const settings = enabled();
  for (const icon of palette.querySelectorAll("[data-status-id]")) {
    const id = icon.dataset.statusId;
    icon.hidden = !settings[id];
    const definition = CONFIG.statusEffects.find(entry => entry.id === id);
    if (definition) icon.dataset.tooltipText = icon.ariaLabel = statusName(definition);
  }
  palette.querySelector(".ucurifunke-hud-conditions")?.remove();
  if (!hud.actor?.isOwner) return;
  const rows = conditionRows(hud.actor.system).filter(row => settings[row.key] && conditionIcons.has(row.key));
  if (!rows.length) return;
  const group = document.createElement("div");
  group.className = "ucurifunke-hud-conditions";
  group.classList.toggle("has-standard", Boolean(palette.querySelector("[data-status-id]:not([hidden])")));
  group.ariaLabel = "Ucurifunke-Zustände";
  group.append(...rows.map(row => conditionButton(hud.actor, row)));
  palette.append(group);
}

Hooks.once("init", () => {
  CONFIG.statusEffects.push({ id: "kneeling", name: german.kneeling, img: iconPath("kneeling") });
  game.settings.register("ucurifunke", "tokenStatuses", {
    scope: "world", config: false, type: Object, default: defaults, onChange: refreshTokenStatuses
  });
  const { DialogV2 } = foundry.applications.api;
  class TokenStatusSettings extends DialogV2 {
    constructor() {
      const content = document.createElement("div");
      for (const [title, entries] of [
        ["Allgemeine Status", CONFIG.statusEffects.map(entry => [entry.id, statusName(entry)])],
        ["Ucurifunke-Zustände", conditionIcons]
      ]) {
        const section = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = title;
        section.append(legend);
        const settings = enabled();
        for (const [id, name] of entries) {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.name = id;
          input.defaultChecked = Boolean(settings[id]);
          label.append(input, name);
          section.append(label);
        }
        content.append(section);
      }
      super({ classes: [...SYSTEM_DIALOG_CLASSES, "ucurifunke-status-settings"],
        window: { title: "Token-Status" }, content,
        buttons: [{ action: "save", label: "Speichern", default: true, callback: (_event, button) =>
          game.settings.set("ucurifunke", "tokenStatuses",
            Object.fromEntries([...button.form.querySelectorAll('input[type="checkbox"]')].map(input => [input.name, input.checked]))) }]
      });
    }
  }
  game.settings.registerMenu("ucurifunke", "tokenStatusMenu", {
    name: "Token-Status", label: "Statusauswahl bearbeiten", icon: "fa-solid fa-heart-pulse",
    type: TokenStatusSettings, restricted: true
  });
});

Hooks.on("renderTokenHUD", decorateHud);
Hooks.on("drawToken", refreshBadges);
Hooks.on("refreshToken", refreshBadges);
Hooks.on("updateActor", (_actor, changes) => {
  if (changes.system?.conditions || "system.conditions" in changes) refreshTokenStatuses();
});
Hooks.on("updateToken", (_token, changes) => {
  if (changes.delta) refreshTokenStatuses();
});
