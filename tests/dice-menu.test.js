import assert from "node:assert/strict";
import { test } from "node:test";

const hooks = new Map();
globalThis.Hooks = { on: (event, handler) => hooks.set(event, handler) };
await import("../src/dice-menu.js");

test("the toolbar opens one dice-pool dialog and a mixed throw posts one card", async () => {
  const controls = { tokens: { order: 0 }, lighting: { order: 9 } };
  hooks.get("getSceneControlButtons")(controls);
  const { order, tools, icon } = controls.ucurifunkeDice;
  assert.equal(order, 10);
  assert.equal(icon, "fa-solid fa-dice-d20");
  const messages = [];
  const warnings = [];
  let response = { w3: "0", w6: "2", w20: "1" };
  let dialogOpened;
  globalThis.foundry = {
    applications: { api: { DialogV2: { input: async options => {
      dialogOpened = options;
      return response;
    } } } },
    dice: { Roll: class {
      constructor(formula) { this.formula = formula; }
      async evaluate() {
        this.dice = [{ faces: 6, results: [{ result: 1 }, { result: 2 }] },
          { faces: 20, results: [{ result: 12 }] }];
        this.total = 15;
        return this;
      }
      toJSON() { return { formula: this.formula }; }
    } },
    documents: { ChatMessage: {
      getSpeaker: () => ({}),
      applyMode: message => message,
      create: async message => { messages.push(message); }
    } }
  };
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.CONFIG = { sounds: { dice: "dice.ogg" } };
  globalThis.ui = { notifications: { warn: warning => warnings.push(warning), error: error => assert.fail(error) } };

  let listener;
  const toolbarButton = { addEventListener: (_event, callback) => { listener = callback; } };
  hooks.get("renderSceneControls")(null, { querySelector: () => toolbarButton });
  listener({ preventDefault() {}, stopPropagation() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(dialogOpened.content, /name="w3" type="number"/);
  assert.match(dialogOpened.content, /name="w6" type="number"/);
  assert.match(dialogOpened.content, /name="w20" type="number"/);
  assert.deepEqual(messages.map(message => message.rolls[0].formula), ["2d6 + 1d20"]);
  assert.match(messages[0].content, /<strong>2W6 \+ 1W20<\/strong>/);
  assert.match(messages[0].content, /<strong>1<\/strong>.*<strong>2<\/strong>/);
  assert.match(messages[0].content, /Summe<\/span><strong>15<\/strong>/);
  for (const selection of [{ w3: "-1", w6: 0, w20: 0 }, { w3: 0, w6: 0, w20: 0 }, null]) {
    response = selection;
    await tools.roll.onChange();
  }
  assert.equal(warnings.length, 1);
  assert.equal(messages.length, 1);
});
