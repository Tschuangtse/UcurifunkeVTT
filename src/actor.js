import { convertCharacter, isPedipalpusCharacter } from "./import-data.js";
import { retinueSource, syncRetinue } from "./retinue.js";

export class UcurifunkeActor extends foundry.documents.Actor {
  async importFromJSON(json) {
    const source = JSON.parse(json.replace(/^\uFEFF/, ""));
    if (!isPedipalpusCharacter(source)) return super.importFromJSON(json);

    const result = await this.importPedipalpusData(convertCharacter(source));
    const retinue = retinueSource(source);
    if (typeof globalThis.game !== "undefined") {
      const pending = await syncRetinue(this, retinue);
      if (pending.length) ui.notifications.warn("Gefolge zur Übernahme durch die Spielleitung vorgemerkt: " + pending.join(", "));
    }
    return result;
  }

  async importPedipalpusData({ name, system, items }) {
    const current = this.toObject();
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
      system: { ...system, combatFocus: current.system?.combatFocus ?? null, dodgeOverride: current.system?.dodgeOverride ?? null },
      items: importedItems,
      prototypeToken: {
        ...current.prototypeToken,
        name: current.prototypeToken?.name === current.name ? name : current.prototypeToken?.name || name
      }
    }));
  }
}
