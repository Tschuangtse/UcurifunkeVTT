const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;
const text = () => new StringField({ required: true, initial: "" });
const number = () => new NumberField({ required: true, nullable: false, initial: 0 });
const integer = (min, initial = 0) => new NumberField({ required: true, integer: true, nullable: false, min, initial });
const optionalInteger = () => new NumberField({ required: true, integer: true, nullable: true, initial: null });
const flag = () => new BooleanField({ required: true, initial: false });
const rows = fields => new ArrayField(new SchemaField(fields), { initial: [] });
const attribute = () => ({ name: text(), key: text(), value: number() });

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sourceVersion: optionalInteger(), sourceName: text(), race: text(),
      reaction: integer(0), impairment: integer(0), hasJointPenalty: flag(),
      hasIron: flag(), hasEndurance: flag(), naturalArmor: integer(0),
      companionArmor: optionalInteger(), companionKind: text(),
      companionDetails: rows({ name: text(), value: text() }),
      conditions: rows({ name: text(), staged: flag(), active: flag(), suppressed: flag(),
        level: integer(0), suppression: integer(0) }),
      offensiveFocus: optionalInteger(), defensiveFocus: optionalInteger(),
      attributes: rows({ ...attribute(), kind: text() }), derived: rows(attribute()), energies: rows({ key: text(), value: number() }),
      skills: rows({ name: text(), group: text(), rollName: text(), value: number(), rollable: flag(), attributes: rows(attribute()) })
    };
  }
}

export class EquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sourceId: text(), group: text(), container: text(), quantity: integer(0, 1), weight: new NumberField({ min: 0, initial: 0 }),
      description: text(), properties: text(), carried: flag(), equipped: flag(), protection: integer(0)
    };
  }
}

export class WeaponData extends EquipmentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      speed: optionalInteger(), reload: optionalInteger(), damage: text(), reach: text(), technique: text(),
      mobilityTolerance: integer(0), attack: optionalInteger(), parry: optionalInteger(),
      preparedCheck: flag(), parryTicks: optionalInteger(),
      attackBreakdown: new ArrayField(integer(), { initial: [] }),
      parryBreakdown: new ArrayField(integer(), { initial: [] })
    };
  }
}
