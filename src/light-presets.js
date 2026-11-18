export const DEFAULT_LIGHT_PRESETS = [
  { id: "fackel", name: "Fackel", bright: 4, color: "#ffc314", type: "flame", speed: 2, intensity: 5 },
  { id: "laterne", name: "Laterne", bright: 6, color: "#ffc314", type: "torch", speed: 2, intensity: 5 },
  { id: "flim-flam", name: "Flim Flam", bright: 4, color: "#befaff", type: "pulse", speed: 2, intensity: 1 }
];

const key = name => name.trim().normalize("NFKC").toLocaleLowerCase("de-DE");

export function validateLight(values, animationTypes) {
  const numbers = Object.fromEntries(["bright", "speed", "intensity"].map(field => {
    const value = values?.[field];
    return [field, value === "" || value == null || typeof value === "boolean" ? NaN : Number(value)];
  }));
  for (const [field, label, min, max] of [
    ["bright", "Lichtstufe", 0, 16], ["speed", "Geschwindigkeit", 0, 10], ["intensity", "Intensität", 1, 10]
  ]) {
    if (!Number.isInteger(numbers[field]) || numbers[field] < min || numbers[field] > max) {
      throw new Error(`${label} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
    }
  }
  if (typeof values.color !== "string" || !/^#[0-9a-f]{6}$/i.test(values.color)) {
    throw new Error("Bitte eine gültige Lichtfarbe wählen.");
  }
  if (typeof values.type !== "string" || (values.type && !animationTypes.includes(values.type))) {
    throw new Error("Bitte einen gültigen Animationstyp wählen.");
  }
  return { ...numbers, color: values.color.toLowerCase(), type: values.type };
}

export function lightUpdate(values) {
  return {
    "light.bright": values.bright, "light.dim": values.bright * 1.5,
    "light.color": values.color, "light.animation.type": values.type || null,
    "light.animation.speed": values.speed, "light.animation.intensity": values.intensity
  };
}

// Every user can write their own flags. Merge revisions across users to share presets
// throughout this world without requiring a GM to be online or granting extra rights.
export function campaignLightPresets(users, animationTypes) {
  const presets = new Map(DEFAULT_LIGHT_PRESETS.map(preset => [preset.id, { ...preset, revision: 0, author: "" }]));
  for (const user of users) {
    const records = user.getFlag("ucurifunke", "lightPresets") ?? {};
    for (const [id, record] of Object.entries(records)) {
      if (!/^[a-zA-Z0-9-]+$/.test(id) || !record || typeof record.name !== "string"
        || !Number.isSafeInteger(record.revision) || record.revision < 1) continue;
      const previous = presets.get(id);
      if (previous && (previous.revision > record.revision
        || (previous.revision === record.revision && previous.author >= user.id))) continue;
      try {
        const light = validateLight(record, animationTypes);
        validatePresetName(record.name, [], id);
        presets.set(id, { ...light, id, name: record.name.trim(), revision: record.revision, author: user.id });
      } catch { /* Ignore malformed user flags instead of breaking the token HUD. */ }
    }
  }
  return [...presets.values()];
}

export function validatePresetName(name, presets, id) {
  if (typeof name !== "string" || (name.match(/\p{L}/gu)?.length ?? 0) < 4 || name.trim().length > 80) {
    throw new Error("Der Presetname benötigt mindestens vier Buchstaben und darf höchstens 80 Zeichen lang sein.");
  }
  if (presets.some(preset => preset.id !== id && key(preset.name) === key(name))) {
    throw new Error("Ein Preset mit diesem Namen existiert bereits.");
  }
  return name.trim();
}
