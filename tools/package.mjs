import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../system.json", import.meta.url), "utf8"));
const dist = new URL("../dist/", import.meta.url);
const archive = new URL(manifest.id + "-v" + manifest.version + ".zip", dist);
mkdirSync(dist, { recursive: true });
copyFileSync(new URL("../system.json", import.meta.url), new URL("system.json", dist));
execFileSync("tar", ["-a", "-cf", fileURLToPath(archive), "system.json", "src", "styles", "templates", "lang", "assets"],
  { cwd: root, stdio: "inherit" });
console.log(fileURLToPath(archive));
