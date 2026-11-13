import assert from "node:assert/strict";
import { test } from "node:test";
import { applyConditionEffects, conditionEffects, conditionRows } from "../src/conditions.js";
import { armorProtection, damageFormula, linkAttack } from "../src/combat-workflow.js";
import { convertCharacter } from "../src/import-data.js";
import { describeImport } from "../src/import-preview.js";

const sample = {
  Name: "Test", Version: 17,
  PrimaryAttributes: [{ ShortName: "GE", LongName: "Gewandtheit", BaseValue: 12 }],
  DerivedValues: [{ ShortName: "GS", LongName: "Geschwindigkeit", TotalValue: 10 }],
  Advantages: [{ Name: "Eisern" }, { Name: "Dichter Pelz" }],
  SimpleConditions: [{ Name: "Blutrausch", IsActive: true, IsSuppressed: true }],
  ComplexConditions: [{ Name: "Schmerz", Level: 3, Suppression: "TwoLevels" }, { Name: "Benommen", Level: 1 }]
};

test("the import loads the Pedipalpus catalogue and combines suppression as in Pedipalpus", () => {
  const { system } = convertCharacter(sample);
  const rows = conditionRows(system);
  assert.equal(rows.length, 10);
  assert.equal(rows.find(row => row.name === "Schmerz").effective, 1);
  assert.equal(rows.find(row => row.name === "Schmerz").max, 4);
  assert.equal(rows.find(row => row.name === "Blutrausch").effective, 0);
  assert.equal(conditionEffects(system).effectiveSpeed, 8);
  assert.equal(system.naturalArmor, 1);
});

test("condition checks apply the flat penalty separately from individual attribute adjustments", () => {
  const actor = { system: convertCharacter({
    ...sample, ComplexConditions: [{ Name: "Lähmung", Level: 1 }, { Name: "Schmerz", Level: 2 }]
  }).system };
  const check = { kind: "skill", name: "Wurf", value: 8,
    attributes: [{ key: "GE", name: "Gewandtheit", value: 12 }, { key: "MU", name: "Mut", value: 10 }] };
  const adjusted = applyConditionEffects(actor, check);
  assert.equal(adjusted.value, 4);
  assert.deepEqual(adjusted.attributes.map(row => row.value), [10, 10]);
  assert.deepEqual(adjusted.conditionPenalties.map(row => row.name), ["Schmerz", "Lähmung", "Lähmung (Gewandtheit)"]);
  assert.equal(check.attributes[0].value, 12);
});

test("dazed, pain, paralysis and frenzy gate the checks covered by the source rules", () => {
  const attack = { kind: "combat", mode: "AT", value: 13 };
  const actor = { system: convertCharacter({ ...sample, ComplexConditions: [{ Name: "Benommen", Level: 3 }] }).system };
  assert.throws(() => applyConditionEffects(actor, attack), /Benommen III/);
  assert.equal(applyConditionEffects(actor, { ...attack, mode: "PA" }).value, 5);
  actor.system.conditions = [{ name: "Schmerz", level: 4 }];
  assert.throws(() => applyConditionEffects(actor, attack), /Schmerz III/);
  actor.system.conditions.push({ name: "Blutrausch", active: true });
  assert.equal(applyConditionEffects(actor, attack).value, 13);
  assert.throws(() => applyConditionEffects(actor, { ...attack, mode: "PA" }), /Blutrausch/);
  actor.system.conditions = [{ name: "Lähmung", level: 3 }];
  assert.throws(() => applyConditionEffects(actor, { kind: "attribute", value: 12 }), /GS 0/);
});

test("the import preview identifies added, changed and removed records", () => {
  const current = convertCharacter({ ...sample, GeneralItems: [{ Name: "Seil" }] });
  const update = convertCharacter({ ...sample, Name: "Geändert", GeneralItems: [{ Name: "Fackel" }] });
  const sections = Object.fromEntries(describeImport(current, update));
  assert.deepEqual(sections.Grundwerte[0], ["Name", "Test", "Geändert"]);
  assert.equal(sections.Ausrüstung.find(row => row[0] === "Fackel")[1], undefined);
  assert.equal(sections.Ausrüstung.find(row => row[0] === "Seil")[2], undefined);
  assert.deepEqual(sections.Zustände, []);
});

test("damage accepts plain Pedipalpus dice formulas and uses only equipped personal armor", () => {
  assert.equal(damageFormula("2W6 − 1"), "2d6-1");
  assert.equal(damageFormula("0"), "0");
  assert.equal(damageFormula("99d100 + @actor"), null);
  const actor = { system: { naturalArmor: 1 }, items: [
    { system: { group: "Rüstung", equipped: true, carried: true, protection: 3 } },
    { system: { group: "Rüstung", equipped: true, carried: false, protection: 4 } }
  ] };
  assert.equal(armorProtection(actor), 4);
  assert.deepEqual(linkAttack({ uuid: "Actor.123" }, { mode: "AT" }, { name: "Test", uuid: "Scene.a.Token.b" }, "2W6", 8).exchange,
    { type: "attack", mode: "AT", target: "Scene.a.Token.b", attacker: "Actor.123", damage: "2W6" });
});
