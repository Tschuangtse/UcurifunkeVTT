import { VARIABLE_COST, parseCost } from "./actions.js";
import { effectiveTicks, tickOverridePatch, weaponTickFields } from "../weapon-ticks.js";

export function weaponChoices(action, items = [], actor) {
  return [...items].flatMap(item => {
    if (item.type !== "weapon" || !item.system.carried) return [];
    const { group, attack, parry } = item.system;
    const melee = group !== "Fernkampf";
    const fields = Object.fromEntries(weaponTickFields(item).map(field => [field.action, field.source]));
    const speed = effectiveTicks(actor, "melee", item.id, fields.melee);
    const parryTicks = effectiveTicks(actor, "parry", item.id, fields.parry);
    const costs = {
      melee: fields.melee,
      opportunity: melee && Number.isInteger(speed) ? Math.ceil(speed / 2) : null,
      approach: melee ? speed : null,
      reload: fields.reload,
      ranged: !melee && Number.isInteger(attack) ? fields.ranged : null,
      parry: fields.parry,
      "parry-maneuver": melee && Number.isInteger(parry) ? parryTicks + 4 : null
    };
    const cost = costs[action.id];
    return Number.isInteger(cost) && cost >= VARIABLE_COST.min && cost <= VARIABLE_COST.max
      ? [{ id: item.id, name: item.name, ticks: cost }] : [];
  });
}

export async function requestCost(action, selection) {
  // Construct text nodes for actor names; never interpolate world data into HTML.
  const content = document.createElement("div");
  // DialogV2 requires its outer content div to have no attributes at all.
  const fields = document.createElement("div");
  fields.className = "uqca-cost-content";
  const actor = document.createElement("p");
  actor.textContent = `Handlung für ${selection.combatant.name ?? selection.token.name ?? "Token"}`;
  const hint = document.createElement("p");
  hint.textContent = action.hint ?? "Gesamtkosten der Handlung in Ticks eingeben.";
  const label = document.createElement("label");
  label.textContent = "Ticks ";
  const input = document.createElement("input");
  const initialCost = String(action.ticks ?? VARIABLE_COST.default);
  Object.assign(input, {
    type: "number", name: "ticks", min: String(VARIABLE_COST.min), max: String(VARIABLE_COST.max),
    step: "1", defaultValue: initialCost, value: initialCost, required: true, autofocus: true
  });
  input.setAttribute("aria-label", "Tickkosten");
  label.append(input);
  fields.append(actor, hint);
  const owner = selection.combatant.actor;
  const overrides = owner?.getFlag?.("ucurifunke", "actionTickOverrides")?.[action.id] ?? {};
  const choices = weaponChoices(action, owner?.items, owner);
  if (choices.length) {
    const weaponLabel = document.createElement("label");
    weaponLabel.textContent = "Waffe ";
    const select = document.createElement("select");
    select.name = "weapon";
    const manual = document.createElement("option");
    manual.value = "";
    manual.textContent = "Ohne Waffenauswahl";
    select.append(manual);
    for (const weapon of choices) {
      const option = document.createElement("option");
      option.value = weapon.id;
      option.textContent = weapon.name + " · " + (overrides[weapon.id] ?? weapon.ticks) + " Ticks";
      select.append(option);
    }
    weaponLabel.append(select);
    fields.append(weaponLabel);
  }
  const reset = document.createElement("button");
  reset.type = "button";
  reset.setAttribute("data-reset-ticks", "");
  reset.textContent = "Zurücksetzen";
  const row = document.createElement("div");
  row.className = "uqca-tick-field";
  row.append(label, reset);
  fields.append(row);
  content.append(fields);

  return foundry.applications.api.DialogV2.prompt({
    window: { title: `${action.name} – Tickkosten` },
    classes: ["uqca-cost-dialog"],
    content,
    modal: true,
    rejectClose: false,
    ok: {
      label: "Ticks hinzufügen",
      callback: (_event, button) => {
        const { elements } = button.form;
        const weaponId = elements.namedItem("weapon")?.value;
        const weapon = choices.find(choice => choice.id === weaponId);
        const field = elements.namedItem("ticks");
        if (!field.reportValidity()) throw new Error("Bitte eine ganze Tickzahl von 0 bis 32 eingeben.");
        const ticks = parseCost(field.value);
        if (weapon) return { ticks, weaponId: weapon.id, importedTicks: weapon.ticks };
        return { ticks, importedTicks: Number(initialCost) };
      }
    },
    render: (_event, dialog) => {
      // DialogV2 serializes and recreates its content. Bind to the live form.
      const field = dialog.element.querySelector('input[name="ticks"]');
      const select = dialog.element.querySelector('select[name="weapon"]');
      const resetButton = dialog.element.querySelector("[data-reset-ticks]");
      const selected = () => choices.find(choice => choice.id === select?.value);
      const key = () => selected()?.id ?? "manual";
      const source = () => selected()?.ticks ?? Number(initialCost);
      const drafts = new Map();
      const updateCost = () => {
        field.value = drafts.get(key()) ?? String(overrides[key()] ?? source());
      };
      field.addEventListener("input", () => drafts.set(key(), field.value));
      resetButton.addEventListener("click", async () => {
        const resetKey = key();
        drafts.set(resetKey, String(source()));
        updateCost();
        try { await saveTickOverride(owner, action.id, selected()?.id, source(), source()); }
        catch (error) { ui.notifications.error(error.message); }
      });
      if (select) {
        select.value = choices[0].id;
        select.addEventListener("change", updateCost);
      }
      updateCost();
      if (select) select.focus();
      else {
        field.focus();
        field.select();
      }
    }
  });
}

export async function saveTickOverride(actor, actionId, weaponId, ticks, importedTicks) {
  if (importedTicks == null || !actor?.isOwner) return;
  const patch = tickOverridePatch(actor, actionId, weaponId, ticks, importedTicks);
  if (Object.keys(patch).length) await actor.update(patch);
}
