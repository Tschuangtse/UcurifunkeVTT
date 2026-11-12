import { postDiceMessage } from "./dice-message.js";

const DICE = [[3, "fa-dice-three"], [6, "fa-dice-d6"], [20, "fa-dice-d20"]];
const MAX_COUNT = 100;
let rolling = false;

async function rollDice(faces) {
  if (rolling) return;
  rolling = true;
  try {
    const die = "W" + faces;
    const result = await foundry.applications.api.DialogV2.input({
      window: { title: die + " würfeln" },
      content: `<label>Anzahl Würfel <input name="count" type="number" min="1" max="${MAX_COUNT}" step="1" value="1" required autofocus></label>`,
      rejectClose: false,
      modal: true,
      ok: { label: "Würfeln", icon: "fa-solid fa-dice-d20" }
    });
    if (!result) return;
    const count = Number(result.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) {
      ui.notifications.warn(`Bitte eine ganze Würfelanzahl von 1 bis ${MAX_COUNT} eingeben.`);
      return;
    }

    const roll = await new foundry.dice.Roll(`${count}d${faces}`).evaluate();
    const dice = roll.dice[0].results.map(({ result }) =>
      `<span class="ucurifunke-card-die"><strong>${result}</strong></span>`).join("");
    const content = `<article class="ucurifunke-check-card ucurifunke-free-roll">
      <header>Würfelwurf: <strong>${count}${die}</strong></header>
      <div>Einzelwürfe</div>
      <div class="ucurifunke-card-dice">${dice}</div>
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
  const name = "ucurifunkeDice";
  const order = Math.max(-1, ...Object.values(controls).map(control => control.order)) + 1;
  const tools = Object.fromEntries(DICE.map(([faces, icon], index) => {
    const key = "w" + faces;
    return [key, { name: key, order: index, title: "W" + faces + " würfeln",
      icon: "fa-solid " + icon, button: true, onChange: () => rollDice(faces) }];
  }));
  controls[name] = { name, order, title: "Würfelmenü", icon: "fa-solid fa-dice-d20", tools };
});
