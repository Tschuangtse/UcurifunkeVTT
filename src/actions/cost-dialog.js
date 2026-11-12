import { VARIABLE_COST, parseCost } from "./actions.js";

export function weaponChoices(action, items = []) {
  return [...items].flatMap(item => {
    if (item.type !== "weapon" || !item.system.carried) return [];
    const { group, speed, reload, attack, parry } = item.system;
    const melee = group !== "Fernkampf";
    const costs = {
      melee: melee ? speed : null,
      opportunity: melee && Number.isInteger(speed) ? Math.ceil(speed / 2) : null,
      approach: melee ? speed : null,
      reload: melee ? null : reload,
      ranged: !melee && Number.isInteger(attack) ? action.ticks : null,
      parry: melee && Number.isInteger(parry) ? action.ticks : null,
      "parry-maneuver": melee && Number.isInteger(parry) ? action.ticks : null
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
  Object.assign(input, {
    type: "number", name: "ticks", min: String(VARIABLE_COST.min), max: String(VARIABLE_COST.max),
    step: "1", value: String(VARIABLE_COST.default), required: true, autofocus: true
  });
  input.setAttribute("aria-label", "Tickkosten");
  label.append(input);
  fields.append(actor, hint);
  const choices = weaponChoices(action, selection.combatant.actor?.items);
  let select;
  if (choices.length) {
    const weaponLabel = document.createElement("label");
    weaponLabel.textContent = "Waffe ";
    select = document.createElement("select");
    const manual = document.createElement("option");
    manual.value = "";
    manual.textContent = "Ohne Waffenauswahl";
    select.append(manual);
    for (const weapon of choices) {
      const option = document.createElement("option");
      option.value = weapon.id;
      option.textContent = weapon.name + " · " + weapon.ticks + " Ticks";
      select.append(option);
    }
    select.value = choices[0].id;
    weaponLabel.append(select);
    fields.append(weaponLabel);
  }
  const updateCost = () => {
    const weapon = choices.find(choice => choice.id === select?.value);
    input.readOnly = Boolean(weapon) || action.ticks !== null;
    input.value = String(weapon?.ticks ?? action.ticks ?? VARIABLE_COST.default);
  };
  updateCost();
  select?.addEventListener("change", updateCost);
  fields.append(label);
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
        const field = button.form.elements.namedItem("ticks");
        if (!field.reportValidity()) throw new Error("Bitte eine ganze Tickzahl von 0 bis 32 eingeben.");
        const ticks = parseCost(field.value);
        return select?.value ? { ticks, weaponId: select.value } : ticks;
      }
    },
    render: (_event, dialog) => {
      const field = dialog.element.querySelector('input[name="ticks"]');
      field?.focus();
      field?.select();
    }
  });
}
