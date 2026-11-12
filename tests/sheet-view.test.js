import assert from "node:assert/strict";
import { test } from "node:test";
import { filterSheet, groupSkills } from "../src/sheet-view.js";

test("grouped legacy skills preserve the original index for every roll button", () => {
  const skills = [
    { name: "Athletik", group: "Körper", attributes: [] },
    { name: "Ortskunde", group: "Wissen", attributes: [] },
    { name: "Athletik – Kraftakt", group: "Körper", attributes: [{ key: "KK" }] }
  ];
  const [body, knowledge] = groupSkills(skills);
  assert.deepEqual(body.rows.map(row => [row.label, row.index]), [["Athletik", 0], ["Kraftakt", 2]]);
  assert.equal(body.rows[1].specialization, true);
  assert.equal(body.rows[1].attributeLabel, "KK");
  assert.equal(knowledge.rows[0].index, 1);
});

test("search combines category and multiple terms and handles German umlauts", () => {
  const bodyRow = { dataset: { filterRow: "Körper Athletik – Kraftakt" } };
  const otherRow = { dataset: { filterRow: "Wissen Athletik" } };
  const groups = [[bodyRow, "Körper"], [otherRow, "Wissen"]].map(([row, group]) => ({
    dataset: { filterGroup: group }, querySelectorAll: () => [row]
  }));
  const empty = {};
  const panel = { querySelectorAll: () => groups, querySelector: () => empty };
  filterSheet(panel, "koerper KRAFTAKT");
  assert.deepEqual(groups.map(group => group.hidden), [false, true]);
  assert.equal(empty.hidden, true);
  filterSheet(panel, "korper", "Wissen");
  assert.equal(empty.hidden, false);
  filterSheet(panel, "");
  assert.deepEqual(groups.map(group => group.hidden), [false, false]);
});
