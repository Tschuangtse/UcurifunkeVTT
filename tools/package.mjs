import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import assert from "node:assert/strict";
import { validateEffect } from "../src/effect-rules.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url);
const archive = new URL(manifest.id + "-v" + manifest.version + ".zip", dist);
mkdirSync(dist, { recursive: true });
const sources = new URL("../pack-sources/effects/", import.meta.url);
const entries = readdirSync(sources).filter(file => file.endsWith(".json")).map(file => JSON.parse(readFileSync(new URL(file, sources), "utf8")));
for (const entry of entries) {
  assert.match(entry._id, /^[a-zA-Z0-9]{16}$/);
  assert.equal(entry._key, "!items!" + entry._id);
  validateEffect(entry.system);
}
assert.ok(entries.length, "Das Effektkompendium darf nicht leer sein.");
const pack = fileURLToPath(new URL("../packs/effects/", import.meta.url));
await compilePack(fileURLToPath(sources), pack);
let verified = 0;
await extractPack(pack, fileURLToPath(new URL("pack-validation/", dist)), { transformEntry(entry) {
  const source = entries.find(row => row._id === entry._id);
  assert.ok(source, "Unbekannter Kompendiumseintrag");
  assert.deepEqual(entry.system, source.system);
  assert.equal(entry.name, source.name);
  assert.equal(entry.type, "effect");
  verified++;
} });
assert.equal(verified, entries.length, "Unvollständiges Effektkompendium");
copyFileSync(new URL("../system.json", import.meta.url), new URL("system.json", dist));
execFileSync("tar", ["-a", "-cf", fileURLToPath(archive), "system.json", "src", "styles", "templates", "lang", "assets", "packs"],
  { cwd: root, stdio: "inherit" });
console.log(fileURLToPath(archive));
