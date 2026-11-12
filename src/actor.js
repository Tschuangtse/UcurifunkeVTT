import { convertCharacter, isPedipalpusCharacter } from "./import-data.js";

export class UcurifunkeActor extends foundry.documents.Actor {
  async importFromJSON(json) {
    const source = JSON.parse(json.replace(/^\uFEFF/, ""));
    if (!isPedipalpusCharacter(source)) return super.importFromJSON(json);

    const { name, system, items } = convertCharacter(source);
    const current = this.toObject();
    const itemIds = new Map(current.items.filter(item => item.system?.sourceId)
      .map(item => [item.system.sourceId, item._id]));
    const importedItems = items.map(item => {
      const id = itemIds.get(item.system.sourceId) ?? foundry.utils.randomID();
      itemIds.delete(item.system.sourceId);
      return { ...item, _id: id };
    });
    return super.importFromJSON(JSON.stringify({
      ...current,
      name,
      system,
      items: importedItems,
      prototypeToken: {
        ...current.prototypeToken,
        name: current.prototypeToken?.name === current.name ? name : current.prototypeToken?.name || name
      }
    }));
  }
}
