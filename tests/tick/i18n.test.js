import test from "node:test";
import assert from "node:assert/strict";
import { getLanguage, strings, t } from "../../src/tick/i18n.js";

test("both language dictionaries cover the same texts", () => {
  let language = "en";
  globalThis.game = { settings: { get: () => language } };
  const english = Object.keys(strings()).sort();
  language = "de";
  assert.deepEqual(Object.keys(strings()).sort(), english);
  assert.ok(Object.values(strings()).every(Boolean));
  language = "unsupported";
  assert.equal(getLanguage(), "en");
});

test("switching language preserves actor and action names in chat text", () => {
  let language = "en";
  globalThis.game = { settings: { settings: new Map([["ucurifunke.language", {}]]),
    get: (scope, key) => scope === "ucurifunke" && key === "language" ? language : undefined } };
  const values = { actor: "Lene", action: "Ritual {actor}" };
  assert.equal(t("actionFinished", values), "Lene finished the action Ritual {actor}.");
  language = "de";
  assert.equal(t("actionFinished", values), "Lene hat die Handlung Ritual {actor} beendet.");
  assert.equal(t("actionCancelled", values), "Lene hat die Handlung Ritual {actor} abgebrochen.");
});
