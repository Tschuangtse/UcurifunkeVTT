import assert from "node:assert/strict";
import { test } from "node:test";
import { convertCharacter } from "../src/import-data.js";
import { attributeCheck, groupAttributes, skillCheck } from "../src/sheet-view.js";
import { evaluateCheck, postRoll, weaponCheck } from "../src/checks.js";
import { renderCheckCard } from "../src/check-card.js";

const primary = ["MU", "KL", "IN", "CH", "FF", "GE", "KO", "KK"]
  .map((key, index) => ({ ShortName: key, LongName: key, BaseValue: 10 + index }));
const links = { FirstAttribute: primary[0], SecondAttribute: primary[1], ThirdAttribute: primary[2] };
const source = {
  Name: "Prüfcharakter", Version: 17, PrimaryAttributes: primary,
  SecondaryAttributes: [{ ShortName: "gMR", LongName: "Geistige Magieresistenz", BaseValue: 2 }],
  BodySkills: [{ ...links, Name: "Athletik", Value: 2, Subskills: [{ Name: "Kraftakt", TotalValue: 8 }] }],
  MagicSchools: [{ ...links, Name: "Einfluss", Value: 3 }],
  Rites: [{ ...links, Name: "Ritus", Value: 5 }],
  HobbySkills: [{ ...links, Name: "Flöte", Value: 3 }],
  Spells: [{ ...links, Name: "Zauber", Value: 2, TotalValue: 5 }],
  Miracles: [{ ...links, Name: "Wunder", TotalValue: 6 }],
  Rituals: [{ ...links, Name: "Ohne Probe", HasCheck: false }, { ...links, Name: "Mit Probe", HasCheck: true }]
};

test("only the Pedipalpus commands with a complete check can be rolled", () => {
  const { system } = convertCharacter(source);
  const rolls = system.skills.map((_, index) => skillCheck(system.skills, index)).filter(Boolean);
  assert.deepEqual(rolls.map(check => [check.name, check.value]), [
    ["Kraftakt", 8], ["Flöte", 3], ["Zauber", 5], ["Mit Probe", 0], ["Wunder", 6]
  ]);
  const legacy = system.skills.map(({ rollName, ...skill }) => ({ ...skill, rollable: true }));
  assert.equal(skillCheck(legacy, 0), null);
  assert.equal(skillCheck(legacy, legacy.findIndex(skill => skill.name === "Einfluss")), null);
  assert.equal(skillCheck(legacy, legacy.findIndex(skill => skill.name === "Ohne Probe")), null);
});

test("secondary attributes use the Pedipalpus skill-command attribute triplets, even for existing actors", () => {
  const attributes = convertCharacter(source).system.attributes.map(({ kind, ...row }) => row);
  const [first, second] = groupAttributes(attributes);
  assert.equal(first.rows.length, 8);
  assert.deepEqual(second.rows[0], { name: "Geistige Magieresistenz", value: 2, index: 8, rollable: true });
  const check = attributeCheck(attributes, 8);
  assert.equal(check.kind, "skill");
  assert.deepEqual(check.attributes.map(row => row.key), ["MU", "KL", "IN"]);
});

test("check cards expose the actual dice and calculation without interpreting imported labels as HTML", () => {
  const modifiers = { penalty: 3, bonus: 1 };
  const attribute = { kind: "attribute", name: "<Mut>", value: 14 };
  const dice = [10, 8, 10];
  const card = renderCheckCard(attribute, dice, modifiers, evaluateCheck(attribute, dice, -2));
  assert.match(card, /&lt;Mut&gt;/);
  assert.match(card, /Gewertet: W1 mit 10/);
  assert.match(card, /Erschwernis: <strong>3<\/strong> · Erleichterung: <strong>1/);
  assert.match(card, /Qualität: <strong>2/);
  const skill = skillCheck(convertCharacter(source).system.skills, 1);
  assert.match(renderCheckCard(skill, dice, modifiers, evaluateCheck(skill, dice, -2)), /<th>Differenz<\/th>/);
  const weapon = { name: "Schwert", system: { attack: 18, technique: "Schwerter", mobilityTolerance: 1,
    attackBreakdown: [8, 10, 0, 0] } };
  const combat = weaponCheck({ system: { impairment: 2 } }, weapon, "AT");
  const combatCard = renderCheckCard(combat, [1], modifiers, evaluateCheck(combat, [1], -2, 5), 5);
  assert.match(combatCard, /Offensive Basis<\/dt><dd>\+10/);
  assert.match(combatCard, /Probenwert<\/dt><dd>15/);
  assert.match(combatCard, /Bestätigung: <strong>5/);
});

test("the custom card is the message content and the roll remains attached", async () => {
  class Roll {
    dice = [{ results: [3, 20, 8].map(result => ({ result })) }];
    async evaluate() { return this; }
    toJSON() { return { formula: "3d20" }; }
  }
  let data;
  globalThis.foundry = { dice: { Roll }, documents: { ChatMessage: {
    getSpeaker: ({ actor }) => ({ alias: actor.name }),
    applyMode: message => ({ ...message, whisper: ["gm"] }),
    create: async message => { data = message; }
  } } };
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.CONFIG = { sounds: { dice: "dice.ogg" } };
  await postRoll({ name: "Rondrik" }, { kind: "attribute", name: "Mut", value: 14 }, { penalty: 0, bonus: 0 });
  assert.match(data.content, /Qualität: <strong>6/);
  assert.equal(data.flavor, undefined);
  assert.deepEqual(data.rolls, [{ formula: "3d20" }]);
  assert.deepEqual(data.whisper, ["gm"]);
});
