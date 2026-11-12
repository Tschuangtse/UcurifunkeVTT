import { test } from "node:test";
import assert from "node:assert/strict";
import { requestCost } from "../../src/actions/cost-dialog.js";
import { ACTIONS } from "../../src/actions/actions.js";

// Minimal DOM double: retain attributes so the Foundry V14 content contract is enforced.
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attributes = new Map(); this.children = []; }
  set className(value) { this.attributes.set("class", value); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  append(...children) { this.children.push(...children); }
}

test("every variable action supplies an attribute-free outer div to DialogV2", async t => {
  const previousDocument = globalThis.document;
  const previousFoundry = globalThis.foundry;
  t.after(() => { globalThis.document = previousDocument; globalThis.foundry = previousFoundry; });
  globalThis.document = { createElement: tag => new Element(tag) };
  const inputs = [];
  globalThis.foundry = { applications: { api: { DialogV2: { prompt: async config => {
    assert.equal(config.content.tagName, "DIV");
    assert.equal(config.content.attributes.size, 0, "config.content element must have no attributes");
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const input = flatten(config.content).find(node => node.tagName === "INPUT");
    assert.ok(input);
    assert.equal(input.type, "number");
    assert.equal(input.min, "0");
    assert.equal(input.max, "32");
    assert.equal(input.step, "1");
    assert.equal(input.value, "8");
    inputs.push(input);
    for (const cost of ["0", "8", "32"]) {
      input.value = cost;
      input.reportValidity = () => true;
      const button = { form: { elements: { namedItem: () => input } } };
      assert.equal(config.ok.callback(null, button), Number(cost));
    }
    return 8;
  } } } } };
  for (const action of ACTIONS.values()) {
    if (action.ticks !== null) continue;
    assert.equal(await requestCost(action, { combatant: { name: "Alrike" }, token: {} }), 8);
  }
  assert.equal(inputs.length, 7);
});

test("weapon changes and submission read the recreated DialogV2 form", async t => {
  const previousDocument = globalThis.document;
  const previousFoundry = globalThis.foundry;
  t.after(() => { globalThis.document = previousDocument; globalThis.foundry = previousFoundry; });
  globalThis.document = { createElement: tag => new Element(tag) };
  globalThis.foundry = { applications: { api: { DialogV2: { prompt: async config => {
    let change;
    const select = { value: "", addEventListener: (_event, callback) => { change = callback; }, focus() {} };
    const field = { value: "", reportValidity: () => true };
    config.render(null, { element: { querySelector: selector => selector.startsWith("select") ? select : field } });
    assert.equal(select.value, "unarmed");
    assert.equal(field.value, "8");
    assert.equal(field.readOnly, true);
    select.value = "sword";
    change();
    assert.equal(field.value, "12");
    const button = { form: { elements: { namedItem: name => name === "weapon" ? select : field } } };
    assert.deepEqual(config.ok.callback(null, button), { weaponId: "sword", ticks: 12 });
    select.value = "";
    change();
    assert.equal(field.readOnly, false);
    field.value = "6";
    return config.ok.callback(null, button);
  } } } } };
  const items = [["unarmed", 8], ["sword", 12]].map(([id, speed]) => ({
    id, name: id, type: "weapon", system: { group: "Nahkampf", carried: true, speed }
  }));
  const selection = { combatant: { name: "Test", actor: { items } }, token: {} };
  assert.equal(await requestCost(ACTIONS.get("melee"), selection), 6);
});
