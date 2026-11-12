import assert from "node:assert/strict";
import { test } from "node:test";

let register;
globalThis.Hooks = { on: (event, handler) => {
  assert.equal(event, "getSceneControlButtons");
  register = handler;
} };
await import("../src/dice-menu.js");

test("native dice control comes last and rolls W3, W6 and W20 with individual results", async () => {
  const controls = { tokens: { order: 0 }, lighting: { order: 9 } };
  register(controls);
  const { order, tools, icon } = controls.ucurifunkeDice;
  assert.equal(order, 10);
  assert.equal(icon, "fa-solid fa-dice-d20");
  assert.deepEqual(Object.keys(tools), ["w3", "w6", "w20"]);
  const messages = [];
  const warnings = [];
  let response = { count: "2" };
  globalThis.foundry = {
    applications: { api: { DialogV2: { input: async () => response } } },
    dice: { Roll: class {
      constructor(formula) { this.formula = formula; }
      async evaluate() {
        this.dice = [{ results: [{ result: 1 }, { result: 2 }] }];
        this.total = 3;
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
  for (const tool of Object.values(tools)) await tool.onChange();
  assert.deepEqual(messages.map(message => message.rolls[0].formula), ["2d3", "2d6", "2d20"]);
  assert.match(messages[0].content, /<strong>2W3<\/strong>/);
  assert.match(messages[0].content, /<strong>1<\/strong>.*<strong>2<\/strong>/);
  assert.match(messages[0].content, /Summe<\/span><strong>3<\/strong>/);
  response = { count: "0" };
  await tools.w3.onChange();
  response = null;
  await tools.w3.onChange();
  assert.equal(warnings.length, 1);
  assert.equal(messages.length, 3);
});
