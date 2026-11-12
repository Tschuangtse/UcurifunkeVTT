export function postDiceMessage(content, rolls, { actor, speaker, mode, hiddenSubject, exchange } = {}) {
  const ChatMessage = foundry.documents.ChatMessage;
  const message = {
    speaker: speaker ?? ChatMessage.getSpeaker(actor ? { actor } : {}),
    content,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: rolls.map(roll => roll.toJSON()),
    sound: CONFIG.sounds.dice
  };
  const data = ChatMessage.applyMode(message, mode);
  if (data.blind && hiddenSubject) {
    const characterName = message.speaker?.alias || actor?.name || globalThis.game?.user?.name;
    data.flags = { ucurifunke: { hiddenCheck: { characterName, subject: hiddenSubject } } };
  }
  if (exchange && !data.blind && !data.whisper?.length) {
    data.flags = { ucurifunke: { exchange } };
    if (exchange.attack) {
      // Competing responders must create the same document for a given step.
      const prefix = exchange.type === "defense" ? "DF" : "DM";
      data._id = prefix + exchange.attack.slice(0, 14);
      return ChatMessage.create(data, { keepId: true });
    }
  }
  return ChatMessage.create(data);
}
