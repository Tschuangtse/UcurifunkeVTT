import { postDiceMessage } from "./dice-message.js";

const CONTROL = "ucurifunkeDice";
const ICON = "fa-solid fa-dice-d20";
const DICE = [3, 6, 20];
const MAX_COUNT = 100;
let rolling = false;

async function openDiceMenu() {
  if (rolling) return;
  rolling = true;
  try {
    const fields = DICE.map(faces => `<label>W${faces}
      <input name="w${faces}" type="number" min="0" max="${MAX_COUNT}" step="1" value="0" required>
    </label>`).join("");
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: "Würfelmenü" },
      content: `<div class="ucurifunke-dice-pool">${fields}</div>`,
      rejectClose: false,
      modal: true,
      ok: { label: "Würfeln", icon: ICON },
      render: (_event, dialog) => {
        const inputs = [...dialog.element.querySelectorAll(".ucurifunke-dice-pool input")];
        const submit = dialog.element.querySelector('button[data-action="ok"], button[type="submit"]');
        if (!submit) return;
        const refresh = () => {
          submit.disabled = !inputs.every(input => input.validity.valid)
            || !inputs.some(input => input.valueAsNumber > 0);
        };
        for (const input of inputs) input.addEventListener("input", refresh);
        refresh();
      }
    });
    if (!result) return;

    const pool = DICE.map(faces => ({ faces, count: Number(result["w" + faces]) }));
    if (!pool.every(({ count }) => Number.isSafeInteger(count) && count >= 0 && count <= MAX_COUNT)) {
      ui.notifications.warn(`Bitte pro Würfelart eine ganze Zahl von 0 bis ${MAX_COUNT} eingeben.`);
      return;
    }
    const selected = pool.filter(({ count }) => count > 0);
    if (!selected.length) return;

    const formula = selected.map(({ count, faces }) => `${count}d${faces}`).join(" + ");
    const notation = selected.map(({ count, faces }) => `${count}W${faces}`).join(" + ");
    const roll = await new foundry.dice.Roll(formula).evaluate();
    const groups = selected.map(({ count, faces }) => {
      const dice = roll.dice.find(die => die.faces === faces).results.map(({ result }) =>
        `<span class="ucurifunke-card-die"><strong>${result}</strong></span>`).join("");
      return `<div>${count}W${faces}<div class="ucurifunke-card-dice">${dice}</div></div>`;
    }).join("");
    const content = `<article class="ucurifunke-check-card ucurifunke-free-roll">
      <header>Würfelwurf: <strong>${notation}</strong></header>
      ${groups}
      <footer><span>Summe</span><strong>${roll.total}</strong></footer>
    </article>`;
    await postDiceMessage(content, [roll]);
  } catch (error) {
    ui.notifications.error(error.message ?? "Der Würfelwurf konnte nicht ausgeführt werden.");
  } finally {
    rolling = false;
  }
}

Hooks.on("getSceneControlButtons", controls => {
  const order = Math.max(-1, ...Object.values(controls).map(control => control.order)) + 1;
  controls[CONTROL] = { name: CONTROL, order, title: "Würfelmenü", icon: ICON, tools: {
    roll: { name: "roll", order: 0, title: "Würfelmenü öffnen", icon: ICON, button: true, onChange: openDiceMenu }
  } };
});

function onDiceMenuClick(event) {
  event.preventDefault();
  event.stopPropagation();
  void openDiceMenu();
}

Hooks.on("renderSceneControls", (_app, html) => {
  const button = html.querySelector(`button[data-control="${CONTROL}"]`);
  button?.addEventListener("click", onDiceMenuClick, { capture: true });
});
