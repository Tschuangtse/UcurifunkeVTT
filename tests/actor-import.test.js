import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCharacter } from "../src/import-data.js";

class CoreActor {
  toObject() {
    return {
      _id: "existingActor001", name: "Platzhalter", type: "character",
      img: "portrait.webp", ownership: { default: 0, player: 3 },
      prototypeToken: { name: "Platzhalter", actorLink: false },
      items: [{ _id: "existingItem0001", system: { sourceId: "sword" } }]
    };
  }

  async importFromJSON(json) {
    return json;
  }
}

globalThis.foundry = {
  documents: { Actor: CoreActor },
  utils: { randomID: () => "generatedItem001" }
};
const { UcurifunkeActor } = await import("../src/actor.js");
const file = JSON.stringify({
  Version: 17, Name: "Testcharakter", Be: 2, Re: "8",
  PrimaryAttributes: [{ LongName: "Mut", ShortName: "MU", BaseValue: 14 }],
  MeleeWeapons: [{ Name: "Schwert", InventoryItemId: "sword", WeaponSpeed: 8 }],
  GeneralItems: [{ Name: "Seil" }]
});

test("Pedipalpus JSON is converted before the core actor import validates it", async () => {
  const source = JSON.parse(await new UcurifunkeActor().importFromJSON(file));
  assert.equal(source.name, "Testcharakter");
  assert.equal(source.type, "character");
  assert.equal(source.prototypeToken.name, source.name);
  assert.equal(source.prototypeToken.actorLink, false);
  assert.equal(source._id, "existingActor001");
  assert.equal(source.img, "portrait.webp");
  assert.equal(source.ownership.player, 3);
  assert.equal(source.system.reaction, 8);
  assert.equal(source.items[0]._id, "generatedItem001");
  assert.equal(source.items[1]._id, "existingItem0001");
});

test("the sidebar importer provides a named prototype token for new actors", () => {
  const actor = parseCharacter("\uFEFF" + file);
  assert.deepEqual(actor.prototypeToken, { name: actor.name, actorLink: true });
});

test("normal Foundry exports go through the unmodified core import", async () => {
  const native = '{"name":"Core","type":"character","prototypeToken":{"name":"Core"}}';
  assert.equal(await new UcurifunkeActor().importFromJSON(native), native);
});
