export function postDiceMessage(content, rolls, { actor, mode, flags } = {}) {
  const ChatMessage = foundry.documents.ChatMessage;
  const message = {
    speaker: ChatMessage.getSpeaker(actor ? { actor } : {}),
    content,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    rolls: rolls.map(roll => roll.toJSON()),
    sound: CONFIG.sounds.dice
  };
  if (flags) message.flags = flags;
  return ChatMessage.create(ChatMessage.applyMode(message, mode));
}
