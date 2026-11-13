export function combatFocus(actor) {
  const { combatFocus, offensiveFocus, defensiveFocus } = actor.system;
  const legacy = () => actor.items?.find(item => item.type === "weapon" && item.system.group !== "Fernkampf"
    && item.system.attackBreakdown?.length === 4)?.system.attackBreakdown[2];
  const value = combatFocus ?? offensiveFocus ?? (defensiveFocus == null ? legacy() ?? 0 : -defensiveFocus);
  return Math.max(-2, Math.min(2, Math.trunc(value)));
}

export function focusModifier(actor, mode, imported) {
  if (mode !== "AT" && mode !== "PA") return 0;
  if (actor.system.combatFocus == null && imported != null) return imported;
  return combatFocus(actor) * (mode === "AT" ? 1 : -1);
}

export function bindFocus(root) {
  const input = root.querySelector('[name="combatFocus"]');
  const refresh = () => {
    const focus = Number(input.value);
    const signed = value => value > 0 ? "+" + value : String(value);
    root.querySelector("[data-focus-off]").textContent = signed(focus);
    root.querySelector("[data-focus-def]").textContent = signed(-focus);
  };
  input.addEventListener("input", refresh);
  refresh();
}

export async function requestFocus(actor, tokenName) {
  const content = await foundry.applications.handlebars.renderTemplate("systems/ucurifunke/templates/combat-focus.hbs",
    { focus: combatFocus(actor), canEdit: true });
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: "Haltung wechseln – " + tokenName }, content, modal: true, rejectClose: false,
    ok: { label: "Haltung wechseln (4 Ticks)" },
    render: (_event, dialog) => bindFocus(dialog.element)
  });
  if (!result) return null;
  const focus = Number(result.combatFocus);
  if (!Number.isInteger(focus) || focus < -2 || focus > 2) throw new Error("Ungültiger Kampffokus.");
  return focus;
}
