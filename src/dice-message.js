export function postDiceMessage(content, rolls, { actor, speaker, mode, hiddenSubject } = {}) {
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
  return ChatMessage.create(data);
}
