import assert from "node:assert/strict";
import { test } from "node:test";
import { convertRetinue, retinueSource, syncRetinue } from "../src/retinue.js";
import { weaponCheck } from "../src/checks.js";
import { partitionSkills } from "../src/sheet-view.js";

const animal = {
  InventoryId: "stable-id", Name: "Falke", Species: "Falke", MU: 8, KL: 4, IN: 15, CH: 5,
  FF: 5, GE: 16, KO: 8, KK: 4, Reaction: 9, MentalMagicResistance: -2, Speed: 16,
  Attacks: [
    { Name: "Krallen", AttackValue: 13, ParryValue: 6, AttackTicks: 7, ParryTicks: 5,
      DamageDiceCount: 1, DamageDiceSides: 6, DamageBonus: 2 },
    { Name: "Stacheln", AttackValue: 9, ParryValue: 9, IsRanged: true, AttackTicks: 6, ReloadTicks: 3,
      DamageExpression: "2W6+1W3" }
  ]
};

test("retinue conversion keeps fixed combat totals, distinct tick costs and official abilities", () => {
  const source = { Animals: [animal], Persons: [{ Name: "Gelehrter", GE: 11, ArmorProtection: 2,
    DerivedValues: [{ Key: "WA", Name: "Wahrnehmung", BaseValue: 7.5 }],
    MagicalAbilities: [{ Name: "Flammen", Value: 8, FirstAttribute: "GE", SecondAttribute: "GE", ThirdAttribute: "" }]
  }], Demons: [{ Name: "Dämon" }], Undead: [{ Name: "Untoter" }],
    Chimeras: [{ Name: "Garten", Components: [{ Name: "Rose", Kind: 1 }] }],
    Armors: [{ Name: "Harnisch", CarrierAnimalId: "stable-id", OnPerson: true, IsEquiped: true, Protection: 2 }] };
  const converted = convertRetinue(retinueSource(source));
  assert.deepEqual(converted.map(row => row.data.system.companionKind), ["Tier", "Person", "Dämon", "Untoter", "Pflanzenchimäre"]);
  assert.equal(converted[0].sourceKey, "Animals:stable-id");
  const bird = converted[0].data;
  assert.equal(bird.type, "retinue");
  assert.equal(bird.system.attributes.find(row => row.key === "gMR").value, -2);
  assert.equal(bird.items[0].system.damage, "1W6+2");
  assert.equal(bird.items[1].system.parry, null);
  assert.equal(bird.items[2].system.carried, true);
  const attack = weaponCheck({ system: { impairment: 4 } }, bird.items[0], "AT");
  assert.equal(attack.value, 13);
  assert.equal(attack.ticks, 7);
  assert.equal(weaponCheck({ system: { impairment: 4 } }, bird.items[0], "PA").ticks, 5);
  const person = converted[1].data.system;
  assert.equal(person.derived[0].value, 8);
  assert.deepEqual(person.skills[0].attributes.map(row => row.key), ["GE", "GE", ""]);
  assert.equal(partitionSkills(person.skills, true).skillTabs[0].groups[0].rows[0].companionAbility, true);
  assert.deepEqual(converted[4].data.system.attributes, []);
});

test("new companions inherit the character ownership, and a repeat import updates the same actor", async () => {
  const ownership = { default: 1, playerA: 3, playerB: 2 };
  const actors = [];
  let canCreate = false;
  let updated;
  let permissions;
  let pending;
  const owner = { id: "owner", toObject: () => ({ ownership }),
    getFlag: () => pending, setFlag: async (_scope, _key, data) => { pending = data; },
    unsetFlag: async () => { pending = undefined; } };
  globalThis.game = { actors, user: { can: () => canCreate } };
  const testRoot = { id: "tests", name: "Tests" };
  owner.folder = { id: "characters", name: "Testcharaktere", folder: testRoot };
  game.folders = [
    { id: "unrelated", name: "Test-Gefolge", type: "Actor" },
    { id: "companions", name: "Test-Gefolge", type: "Actor", folder: testRoot }
  ];
  globalThis.foundry = { documents: { Actor: { implementation: { create: async data => {
    actors.push({ ...data, isOwner: true,
      getFlag: (scope, key) => data.flags[scope]?.[key],
      toObject: () => ({ ownership: { default: 1, playerA: 3, playerB: 2 } }),
      update: async changes => { permissions = changes; },
      importPedipalpusData: async entry => { updated = entry; }
    });
  } } } } };
  const source = retinueSource({ Animals: [animal] });
  assert.deepEqual(await syncRetinue(owner, source), ["Falke"]);
  assert.equal(actors.length, 0);
  assert.ok(pending);
  canCreate = true;
  assert.deepEqual(await syncRetinue(owner, pending), []);
  assert.equal(actors.length, 1);
  assert.equal(actors[0].folder, "companions");
  assert.deepEqual(actors[0].ownership, ownership);
  assert.equal(actors[0].getFlag("ucurifunke", "retinueOwner"), "owner");
  assert.equal(pending, undefined);
  canCreate = false;
  assert.deepEqual(await syncRetinue(owner, retinueSource({ Animals: [{ ...animal, Name: "Habicht" }] })), []);
  assert.equal(actors.length, 1);
  assert.equal(updated.name, "Habicht");
  game.user.isGM = true;
  delete ownership.playerB;
  ownership.playerC = 3;
  await syncRetinue(owner, source);
  assert.deepEqual(permissions, { "ownership.-=playerB": null, "ownership.playerC": 3 });
  canCreate = true;
  await syncRetinue(owner, retinueSource({ Animals: [{ ...animal, InventoryId: "other" }] }), { folder: "bulk" });
  assert.equal(actors.at(-1).folder, "bulk");
});

test("explicit empty lists remove old members and their tokens while absent lists preserve them", async () => {
  const events = [];
  const old = { id: "old", type: "retinue", name: "Falke", isOwner: true,
    getFlag: (_scope, key) => key === "retinueOwner" ? "parent" : "Animals:old",
    delete: async () => events.push("actor")
  };
  const owner = { id: "parent", getFlag: () => undefined };
  globalThis.game = { actors: [old], user: { isGM: true }, scenes: [{
    tokens: [{ id: "old-token", actorId: "old" }, { id: "kept-token", actorId: "other" }],
    deleteEmbeddedDocuments: async (type, ids) => events.push([type, ids])
  }] };
  await syncRetinue(owner, retinueSource({}));
  assert.deepEqual(events, []);
  await syncRetinue(owner, retinueSource({ Animals: [] }));
  assert.deepEqual(events, [["Token", ["old-token"]], "actor"]);
});
