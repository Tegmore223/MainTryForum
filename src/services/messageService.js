const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const { logAction } = require('./logService');
const { findUserByNickname, getUserById } = require('./userService');

function sanitizeContent(content) {
  return String(content || '').trim().slice(0, 1200);
}

function sendMessage({ fromId, toNickname, toId, content }) {
  const db = readDb();
  const body = sanitizeContent(content);
  if (!body) throw new Error('empty_message');
  const sender = getUserById(fromId);
  if (!sender) throw new Error('sender_not_found');
  let recipient = null;
  if (toId) {
    recipient = getUserById(toId);
  }
  const normalizedNickname = String(toNickname || '').trim();
  if (!recipient && normalizedNickname) {
    recipient = findUserByNickname(normalizedNickname);
  }
  if (!recipient) throw new Error('recipient_not_found');
  if (recipient.id === sender.id) throw new Error('self_message_forbidden');
  const message = {
    id: createId('msg-'),
    fromId: sender.id,
    fromNickname: sender.nickname,
    toId: recipient.id,
    toNickname: recipient.nickname,
    content: body,
    createdAt: new Date().toISOString(),
    readAt: null
  };
  db.messages.unshift(message);
  writeDb(db);
  logAction('direct_message', sender.nickname, { to: recipient.nickname });
  return message;
}

function listMessages(userId) {
  const db = readDb();
  const inbox = db.messages.filter((msg) => msg.toId === userId);
  const sent = db.messages.filter((msg) => msg.fromId === userId);
  return { inbox, sent };
}

function markRead(messageId, userId) {
  const db = readDb();
  const message = db.messages.find((msg) => msg.id === messageId && msg.toId === userId);
  if (!message) throw new Error('message_not_found');
  if (!message.readAt) {
    message.readAt = new Date().toISOString();
    writeDb(db);
  }
  return message;
}

module.exports = { sendMessage, listMessages, markRead };
