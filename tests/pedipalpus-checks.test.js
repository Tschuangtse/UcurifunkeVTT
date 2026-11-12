import assert from "node:assert/strict";
import { test } from "node:test";
import { convertCharacter } from "../src/import-data.js";
import { attributeCheck, groupAttributes, perceptionCheck, skillCheck } from "../src/sheet-view.js";
import { evaluateCheck, postRoll, prepareRoll, renderHiddenCheck, weaponCheck } from "../src/checks.js";
import { renderCheckCard } from "../src/check-card.js";
import { parseCheckCommand } from "../src/chat-commands.js";
import { readTechniqueSettings, techniqueCheck, techniqueFlag, techniqueSettings } from "../src/technique-check.js";

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

test("clipboard commands preserve prepared targets, signed values, and attribute order", () => {
  assert.deepEqual(parseCheckCommand("/attributecheck Mut | -2"), { kind: "attribute", name: "Mut", value: -2 });
  const skill = parseCheckCommand("/skillcheck Dauerbelastung | Gewandtheit 14 | Konstitution 15 | Körperkraft 18 | 6");
  assert.equal(skill.value, 6);
  assert.deepEqual(skill.attributes.map(attribute => attribute.value), [14, 15, 18]);
  assert.deepEqual(parseCheckCommand("/skillcheck Dauerbelastung 14 15 18 6").attributes.map(row => row.value), [14, 15, 18]);
  assert.equal(parseCheckCommand("/AT Schwert|Schwerter|8|10|-1|2|3").value, 16);
  assert.equal(parseCheckCommand("/pa Schwert|Schwerter|8|9|0|-2|3").value, 12);
  assert.deepEqual(parseCheckCommand("/FK Bogen|Bögen|5|9|-2|3").breakdown, [5, 9, 0, -2]);
  assert.equal(parseCheckCommand("/FK Bogen|Bögen|5|9|x|3"), null);
  assert.equal(parseCheckCommand("/attributecheck Mut"), null);
});

test("perception uses the derived value, allows repeated attributes, and starts each roll with KL/IN/IN", () => {
  const { system } = convertCharacter({ ...source, DerivedValues: [{ ShortName: "WA", LongName: "Wahrnehmung", TotalValue: 7 }] });
  assert.equal(perceptionCheck(system).value, 7);
  assert.deepEqual(perceptionCheck(system, ["KK", "KO", "MU"]).attributes.map(row => row.key), ["KK", "KO", "MU"]);
  assert.deepEqual(perceptionCheck(system).attributes.map(row => row.key), ["KL", "IN", "IN"]);
  assert.equal(perceptionCheck(system, ["KK", "gMR", "MU"]), null);
});

test("technique checks use stored settings, weapon rules, and legacy focus values", () => {
  const skill = { name: "Schwerter", group: "Nahkampf", value: 8 };
  const settings = readTechniqueSettings({ tolerance: "2", ticks: "8", offensive: "+3", defensive: "-1" });
  const actor = {
    system: { derived: [{ key: "OFF", value: 10 }, { key: "DEF", value: 9 }, { key: "FKB", value: 7 }],
      impairment: 5, hasJointPenalty: true, offensiveFocus: 2, defensiveFocus: null },
    items: [{ type: "weapon", system: { group: "Nahkampf", parryBreakdown: [8, 9, 4, 0] } }],
    getFlag: () => ({ [techniqueFlag(skill)]: settings })
  };
  assert.deepEqual(techniqueSettings(actor, skill), settings);
  assert.equal(techniqueSettings(actor, { ...skill, name: "Dolche" }).ticks, 0);
  assert.deepEqual(techniqueCheck(actor, skill, "AT", settings).breakdown, [8, 10, 2, 3]);
  assert.equal(techniqueCheck(actor, skill, "AT", settings).value, 20);
  assert.equal(techniqueCheck(actor, skill, "PA", settings).value, 15);
  assert.equal(techniqueCheck(actor, { ...skill, group: "Fernkampf" }, "FK", settings).value, 15);
  assert.equal(techniqueCheck(actor, skill, "FK", settings), null);
  assert.throws(() => readTechniqueSettings({ ...settings, ticks: 33 }), /Tickkosten/);
});

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
  assert.deepEqual(second.rows[0], { name: "Geistige Magieresistenz", key: "gMR", value: 2, index: 8, rollable: true });
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

test("the custom card keeps its roll and only the checkbox forces Foundry blind mode", async () => {
  class Roll {
    dice = [{ results: [3, 20, 8].map(result => ({ result })) }];
    async evaluate() { return this; }
    toJSON() { return { formula: "3d20" }; }
  }
  let data;
  let mode;
  globalThis.foundry = { dice: { Roll }, documents: { ChatMessage: {
    getSpeaker: ({ actor }) => ({ alias: actor.name }),
    applyMode: (message, selection) => {
      mode = selection;
      return { ...message, whisper: ["gm"], blind: selection === "blind" };
    },
    create: async message => { data = message; }
  } } };
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.CONFIG = { sounds: { dice: "dice.ogg" } };
  await postRoll({ name: "Rondrik" }, { kind: "attribute", name: "Mut", value: 14 }, { penalty: 0, bonus: 0 });
  assert.match(data.content, /Qualität: <strong>6/);
  assert.equal(data.flavor, undefined);
  assert.deepEqual(data.rolls, [{ formula: "3d20" }]);
  assert.deepEqual(data.whisper, ["gm"]);
  assert.equal(mode, undefined);
  assert.equal(data.flags, undefined);
  await postRoll({ name: "Rondrik" }, { kind: "attribute", name: "Mut", value: 14 }, { penalty: 0, bonus: 0, blind: true });
  assert.equal(mode, "blind");
  assert.equal(data.blind, true);
  assert.deepEqual(data.flags.ucurifunke.hiddenCheck, { characterName: "Rondrik", subject: "Mut" });
});

test("the check dialog matches the reference module's three input options", async () => {
  let options;
  globalThis.foundry = { applications: { api: { DialogV2: { input: async config => {
    options = config;
    return { difficulty: "", relief: 2, blind: "on" };
  } } } } };
  const modifiers = await prepareRoll({ kind: "attribute", name: "Mut" });
  assert.match(options.content, /name="difficulty"/);
  assert.match(options.content, /name="relief"/);
  assert.match(options.content, /Verdeckte Probe/);
  assert.match(options.content, /name="blind" type="checkbox"/);
  assert.deepEqual(modifiers, { penalty: 0, bonus: 2, blind: true });
});

test("only the author of a hidden result gets the check-name notice", () => {
  const hidden = { characterName: "Rondrik", subject: "<Probe>" };
  const message = { isContentVisible: false, isAuthor: false, getFlag: () => hidden };
  let rendered;
  globalThis.document = { createElement: () => ({}) };
  const content = { replaceChildren: (...children) => { rendered = children; } };
  const html = { querySelector: selector => selector === ".message-flavor" ? null : content };
  renderHiddenCheck(message, html);
  renderHiddenCheck({ ...message, isContentVisible: true, isAuthor: true }, html);
  assert.equal(rendered, undefined);
  renderHiddenCheck({ ...message, isAuthor: true }, html);
  assert.equal(rendered[0].textContent, "Rondrik");
  assert.equal(rendered[2].textContent, "<Probe>");
});
