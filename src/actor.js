import { convertCharacter, isPedipalpusCharacter } from "./import-data.js";
import { retinueSource, syncRetinue } from "./retinue.js";
import { convertNpc, isNpcFile, npcRetinue } from "./npc-import.js";
import { damageRows, energyRows } from "./energy.js";

export class UcurifunkeActor extends foundry.documents.Actor {
  async update(data, options = {}) {
    if (this.type === "bodypart" && this.isToken && this.token?.getFlag("ucurifunke", "segment") && !options.uqAutomation) {
      const expanded = foundry.utils.expandObject(data);
      const health = expanded.system?.health;
      if (health) {
        delete expanded.system.health;
        if (!Object.keys(expanded.system).length) delete expanded.system;
        if (Object.keys(expanded).length) await super.update(expanded, options);
        const { requestAutomation } = await import("./automation-queue.js");
        await requestAutomation("partHealth", this.token.uuid, health);
        return this;
      }
    }
    return super.update(data, options);
  }

  async modifyTokenAttribute(attribute, value, isDelta, isBar) {
    if (this.type === "bodypart" && this.isToken && attribute === "health" && this.token?.getFlag("ucurifunke", "segment")) {
      const { requestAutomation } = await import("./automation-queue.js");
      return requestAutomation("partHealth", this.token.uuid, isDelta ? { delta: Number(value) } : { value: Number(value) });
    }
    return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
  }

  async toggleStatusEffect(...args) {
    if (["object", "bodypart"].includes(this.type)) return null;
    return super.toggleStatusEffect(...args);
  }

  async importFromJSON(json) {
    const source = JSON.parse(json.replace(/^\uFEFF/, ""));
    if (isNpcFile(source)) {
      if (this.type !== "npc") throw new Error("NSC-Dateien können nur in Akteure vom Typ NSC importiert werden.");
      const result = await this.importPedipalpusData(convertNpc(source));
      const pending = await syncRetinue(this, retinueSource(npcRetinue(source)));
      if (pending.length) ui.notifications.warn("Gefolge zur Übernahme vorgemerkt: " + pending.join(", "));
      return result;
    }
    if (!isPedipalpusCharacter(source)) return super.importFromJSON(json);

    const result = await this.importPedipalpusData(convertCharacter(source));
    const retinue = retinueSource(source);
    if (typeof globalThis.game !== "undefined") {
      const pending = await syncRetinue(this, retinue);
      if (pending.length) ui.notifications.warn("Gefolge zur Übernahme durch die Spielleitung vorgemerkt: " + pending.join(", "));
    }
    return result;
  }

  async importPedipalpusData({ name, system, items }, { keepEnergy = true } = {}) {
    if (["object", "bodypart"].includes(this.type)) throw new Error("Charakterdaten können nicht in Gegenstände oder Körperteile importiert werden.");
    const current = this.toObject();
    if (keepEnergy && energyRows(current.system).length) {
      const previous = energyRows(current.system);
      system = { ...system, damage: damageRows(current.system),
        energies: [...previous, ...energyRows(system).filter(row => !previous.some(old => old.key === row.key))] };
    }
    const previousItems = new Map(current.items.filter(item => item.system?.sourceId)
      .map(item => [item.system.sourceId, item]));
    const importedItems = items.map(item => {
      const previous = previousItems.get(item.system.sourceId);
      previousItems.delete(item.system.sourceId);
      return { ...previous, ...item, _id: previous?._id ?? foundry.utils.randomID() };
    });
    return super.importFromJSON(JSON.stringify({
      ...current,
      name,
      system: { ...system, damage: system.damage ?? [], combatFocus: current.system?.combatFocus ?? null, dodgeOverride: current.system?.dodgeOverride ?? null },
      items: importedItems,
      prototypeToken: {
        ...current.prototypeToken,
        name: current.prototypeToken?.name === current.name ? name : current.prototypeToken?.name || name
      }
    }));
  }
}
