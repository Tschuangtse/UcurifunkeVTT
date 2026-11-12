import { postRoll, prepareRoll } from "./checks.js";

const COMMAND = /^\/(attributecheck|skillcheck|at|pa|fk)(?=\s|$)\s*([^\r\n]*)$/i;
const INTEGER = /^[+-]?\d+$/;
const readInteger = text => INTEGER.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;

export function parseCheckCommand(message) {
  const match = COMMAND.exec(message.trim());
  if (!match) return null;
  const [, command, input] = match;
  const mode = command.toUpperCase();
  const parts = input.split("|").map(part => part.trim());
  const [name] = parts;
  if (!name) return null;
  if (mode === "ATTRIBUTECHECK") {
    const compact = parts.length === 1 && /^(.+?)\s+([+-]?\d+)$/.exec(name);
    const value = readInteger(compact ? compact[2] : parts[1]);
    return (compact || parts.length === 2) && value !== null
      ? { kind: "attribute", name: compact ? compact[1] : name, value } : null;
  }
  if (mode === "SKILLCHECK") {
    const compact = parts.length === 1 && /^(.+?)\s+([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)\s+([+-]?\d+)$/.exec(name);
    if (!compact && parts.length !== 5) return null;
    const attributes = (compact ? compact.slice(2, 5) : parts.slice(1, 4)).map(part => {
      const named = /^(.+?)\s+([+-]?\d+)$/.exec(part);
      return { name: named?.[1] ?? "", value: readInteger(named?.[2] ?? part) };
    });
    const value = readInteger(compact ? compact[5] : parts[4]);
    return value !== null && attributes.every(attribute => attribute.value !== null)
      ? { kind: "skill", name: compact ? compact[1] : name, value, attributes } : null;
  }
  const [weapon, technique, ...numbers] = parts;
  const values = numbers.map(readInteger);
  if (!technique || values.length !== (mode === "FK" ? 4 : 5) || values.includes(null)) return null;
  if (mode === "FK") values.splice(2, 0, 0);
  const impairment = values.pop();
  const value = values.reduce((sum, entry) => sum + entry, 0) - impairment;
  return { kind: "combat", mode, name: mode + " · " + weapon, weapon, technique, breakdown: values, impairment, value };
}

export function registerCheckCommands(commands) {
  for (const command of ["attributecheck", "skillcheck", "AT", "PA", "FK"]) {
    commands[command] = {
      rgx: new RegExp(`^/${command}(?=\\s|$)\\s*([^\\r\\n]*)$`, "i"),
      fn: async (_command, match, chatData) => {
        const check = parseCheckCommand(match[0]);
        if (!check) {
          ui.notifications.warn(`Ungültige Probe. Bitte den vollständigen Befehl /${command} aus Pedipalpus einfügen.`);
          return false;
        }
        const modifiers = await prepareRoll(check);
        if (modifiers) await postRoll(null, check, modifiers, chatData.speaker);
        return false;
      }
    };
  }
}
