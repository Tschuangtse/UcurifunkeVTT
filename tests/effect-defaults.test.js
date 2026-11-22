import test from "node:test";
import assert from "node:assert/strict";
import { validateEffect } from "../src/effect-rules.js";

class Field { constructor(options={}) { this.options=options; } }
class SchemaField extends Field { constructor(fields,options) { super(options);this.fields=fields; } }
class ArrayField extends Field { constructor(element,options) { super(options);this.element=element; } }
globalThis.foundry={abstract:{TypeDataModel:class{}},data:{fields:{ArrayField,SchemaField,BooleanField:Field,NumberField:Field,StringField:Field}}};
const {EffectData}=await import("../src/models.js");

test("blank effect creation supplies complete nested array defaults before Foundry validates the Item",()=>{
  const schema=EffectData.defineSchema(),changes=schema.changes.options.initial;
  assert.ok(changes.length);
  for(const row of changes)for(const[key,field]of Object.entries(schema.changes.element.fields)) {
    if(field.options.required||field.options.initial!==undefined)assert.notEqual(row[key],undefined,`Missing initial change field: ${key}`);
  }
  const defaults=Object.fromEntries(Object.entries(schema).map(([key,field])=>[key,field.options.initial]));
  assert.equal(validateEffect(defaults).changes[0].filterType,"all");
  assert.equal(validateEffect(defaults).changes[0].filterValue,"");
});
