import { validateEffect } from "./effect-rules.js";
const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const text = () => new StringField({ required: true, initial: "" });
const number = () => new NumberField({ required: true, nullable: false, initial: 0 });
const integer = (min, initial = 0) => new NumberField({ required: true, integer: true, nullable: false, min, initial });
const optionalInteger = () => new NumberField({ required: true, integer: true, nullable: true, initial: null });
const flag = () => new BooleanField({ required: true, initial: false });
const rows = fields => new ArrayField(new SchemaField(fields), { initial: [] });
const attribute = () => ({ name: text(), key: text(), value: number() });

export class BodyPartData extends foundry.abstract.TypeDataModel {
  static validateJoint(data) {
    if (data.health.value > data.health.max) throw new Error("Aktuelle LE dürfen die maximalen LE nicht überschreiten.");
  }
  static defineSchema() {
    return { health: new SchemaField({ value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 10 }),
      max: new NumberField({ required: true, nullable: false, integer: true, min: 1, max: 1000000, initial: 10 }) }) };
  }
}

export class EffectData extends foundry.abstract.TypeDataModel {
  static validateJoint(data) { validateEffect(data); }
  static defineSchema() {
    return { description: text(), kind: new StringField({ required: true, choices: ["periodic", "continuous"], initial: "periodic" }),
      interval: integer(1, 20), duration: integer(1, 60), recurring: new BooleanField({ initial: true }), permanent: new BooleanField({ initial: true }), stackable: flag(),
      changes: new ArrayField(new SchemaField({ target: text(), mode: new StringField({ choices: ["add", "percent"], initial: "add" }), value: number(),
        filterType:new StringField({initial:"all"}), filterValue:text() }),
        // Initial array rows must already include their nested field defaults.
        { initial: [{ target: "LE", mode: "add", value: 4, filterType: "all", filterValue: "" }] }) };
  }
}

export class ObjectData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      hardness: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 30, initial: 0 }),
      structure: new SchemaField({
        value: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 3, initial: 3 }),
        max: new NumberField({ required: true, nullable: false, integer: true, min: 3, max: 3, initial: 3 })
      }),
      description: text(), size: text(), weight: new NumberField({ required: true, nullable: false, min: 0, initial: 0 })
    };
  }
}

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sourceVersion: optionalInteger(), sourceName: text(), race: text(), npcGenerator: flag(),
      reaction: integer(0), impairment: integer(0), hasJointPenalty: flag(),
      hasIron: flag(), hasEndurance: flag(), armorTraining: flag(), naturalArmor: integer(0),
      companionArmor: optionalInteger(), companionKind: text(),
      companionDetails: rows({ name: text(), value: text() }),
      conditions: rows({ name: text(), staged: flag(), active: flag(), suppressed: flag(),
        level: integer(0), suppression: integer(0) }),
      offensiveFocus: optionalInteger(), defensiveFocus: optionalInteger(), combatFocus: optionalInteger(),
      dodgeOverride: optionalInteger(),
      attributes: rows({ ...attribute(), kind: text() }), derived: rows(attribute()),
      energies: rows({ key: text(), value: number(), max: optionalInteger() }),
      damage: rows({ source: text(), original: integer(0), remaining: integer(0), timestamp: text() }),
      regeneration: new SchemaField({
        required: integer(0, 6), nonSleeper: integer(0), fastHealing: flag(), sleepDisorder: flag(),
        metalAffinity: flag(), severeIronBan: flag(), penance: flag(), astralRegenerationLevel: integer(0),
        useLeyLines: flag(), ordinationRank: integer(1, 1)
      }),
      skills: rows({ name: text(), group: text(), rollName: text(), description: text(), value: number(), rollable: flag(), attributes: rows(attribute()) })
    };
  }
}

export class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sourceId: text(), group: text(), container: text(), quantity: integer(0, 1), weight: new NumberField({ min: 0, initial: 0 }),
      description: text(), properties: text(), carried: flag(), equipped: flag(), protection: integer(0),
      mobilityPenalty: integer(0), assignedCarrier: flag()
    };
  }
}

export class WeaponData extends EquipmentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      speed: optionalInteger(), reload: optionalInteger(), damage: text(), reach: text(), technique: text(),
      mobilityTolerance: integer(0), attack: optionalInteger(), parry: optionalInteger(),
      preparedCheck: flag(), useAttackTicks: flag(), parryTicks: optionalInteger(),
      attackBreakdown: new ArrayField(integer(), { initial: [] }),
      parryBreakdown: new ArrayField(integer(), { initial: [] })
    };
  }
}
