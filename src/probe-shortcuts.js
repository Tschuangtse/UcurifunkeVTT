export function rollReference(button, actor) {
  const { kind, item, index, mode } = button.dataset;
  const row = kind === "attribute" ? actor.system.attributes[index] : actor.system.skills[index];
  return { kind, mode, item, ...(row && index != null ? { name: row.name, group: row.group, key: row.key } : {}) };
}

export function referenceKey(ref) {
  return JSON.stringify([ref.kind, ref.mode, ref.item, ref.name, ref.group, ref.key]);
}

export async function rollSavedProbe(actorId, ref) {
  const actor = game.actors.get(actorId);
  if (!actor?.isOwner) return ui.notifications.warn("Keine Berechtigung für diese Probe.");
  await actor.sheet.render({ force: true });
  const matches = [...actor.sheet.element.querySelectorAll('[data-action="rollCheck"]')]
    .filter(button => referenceKey(rollReference(button, actor)) === referenceKey(ref));
  if (matches.length !== 1) return ui.notifications.warn("Die gespeicherte Probe ist nicht mehr eindeutig verfügbar.");
  matches[0].click();
}

export async function createProbeMacro(data, slot) {
  const actor = game.actors.get(data.actorId);
  const Macro = foundry.documents.Macro.implementation;
  if (!actor?.isOwner || !game.user.can("MACRO_SCRIPT") || !Macro.canUserCreate(game.user)) {
    return ui.notifications.warn("Für dieses Probenmakro fehlen die nötigen Foundry-Rechte.");
  }
  const command = `await game.ucurifunke.rollSavedProbe(${JSON.stringify(actor.id)}, ${JSON.stringify(data.reference)});`;
  if (typeof data.label !== "string" || !data.reference?.kind) return;
  const macro = game.macros.find(m => m.isOwner && m.command === command)
    ?? await Macro.create({ name: data.label, type: "script", command });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export function bindProbeShortcuts(root, actor, onRefresh) {
  if (!actor.isOwner || actor.isToken) return;
  const user = game.user;
  const read = () => user.getFlag("ucurifunke", "favorites")?.[actor.id] ?? [];
  const bar = root.querySelector("[data-probe-favorites]");
  const buttons = [...root.querySelectorAll('[data-action="rollCheck"]')];
  const stars = [];
  function refresh() {
    const saved = new Set(read());
    bar.replaceChildren();
    for (const [button, star, key, toggle] of stars) {
      const active = saved.has(key);
      star.setAttribute("aria-pressed", String(active));
      star.textContent = active ? "★" : "☆";
      if (!active) continue;
      const row = document.createElement("li");
      row.dataset.filterRow = button.ariaLabel;
      const shortcut = document.createElement("button");
      shortcut.type = "button";
      shortcut.textContent = button.ariaLabel || button.title;
      shortcut.onclick = () => button.click();
      shortcut.draggable = true;
      shortcut.ondragstart = button.ondragstart;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = star.className;
      remove.ariaLabel = "Favorit entfernen: " + shortcut.textContent;
      remove.title = remove.ariaLabel;
      remove.textContent = "★";
      remove.setAttribute("aria-pressed", "true");
      remove.onclick = toggle;
      row.append(shortcut, remove);
      bar.append(row);
    }
    onRefresh(Boolean(bar.children.length));
  }
  for (const button of buttons) {
    const ref = rollReference(button, actor);
    const key = referenceKey(ref);
    button.draggable = true;
    button.ondragstart = event => {
      event.stopPropagation();
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "UcurifunkeProbe", actorId: actor.id, reference: ref, label: button.ariaLabel
      }));
    };
    if (ref.kind === "perception") continue;
    const star = document.createElement("button");
    star.type = "button";
    star.className = "ucurifunke-probe-star";
    star.ariaLabel = "Favorit: " + button.ariaLabel;
    const toggle = async () => {
      try {
        const saved = new Set(read());
        if (!saved.delete(key)) saved.add(key);
        await user.update({ ["flags.ucurifunke.favorites." + actor.id]: [...saved] });
        refresh();
      } catch (error) { ui.notifications.error(error.message); }
    };
    star.onclick = toggle;
    stars.push([button, star, key, toggle]);
    button.after(star);
  }
  refresh();
}
