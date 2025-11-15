const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const { logAction } = require('./logService');
const { findUserByNickname, getUserById } = require('./userService');

const MAX_MESSAGES = 200;

function sanitizeContent(content) {
  return String(content || '').trim().slice(0, 2000);
}

function loadDb() {
  const db = readDb();
  db.chats = db.chats || [];
  db.messages = db.messages || [];
  if (db.messages.length) {
    const grouped = {};
    db.messages.forEach((legacy) => {
      if (!legacy.fromId || !legacy.toId) return;
      const pair = [legacy.fromId, legacy.toId].sort();
      const key = pair.join('::');
      if (!grouped[key]) {
        grouped[key] = {
          id: createId('chat-'),
          participants: pair,
          createdAt: legacy.createdAt || new Date().toISOString(),
          updatedAt: legacy.createdAt || new Date().toISOString(),
          messages: [],
          readMap: {}
        };
        db.chats.push(grouped[key]);
      }
      grouped[key].messages.push({
        id: legacy.id || createId('msg-'),
        authorId: legacy.fromId,
        authorNickname: legacy.fromNickname || 'Аноним',
        content: legacy.content,
        createdAt: legacy.createdAt || new Date().toISOString()
      });
      grouped[key].updatedAt = grouped[key].messages[grouped[key].messages.length - 1].createdAt;
    });
    db.messages = [];
    writeDb(db);
  }
  return db;
}

function ensureChat(db, memberA, memberB) {
  const pair = [memberA, memberB].sort();
  let chat = db.chats.find((entry) => entry.participants[0] === pair[0] && entry.participants[1] === pair[1]);
  if (!chat) {
    const now = new Date().toISOString();
    chat = {
      id: createId('chat-'),
      participants: pair,
      createdAt: now,
      updatedAt: now,
      messages: [],
      readMap: {
        [pair[0]]: null,
        [pair[1]]: null
      }
    };
    db.chats.unshift(chat);
  }
  return chat;
}

function normalizeChat(chat, viewerId) {
  const participants = chat.participants.map((id) => {
    const user = getUserById(id);
    return {
      id,
      nickname: user ? user.nickname : 'Аноним',
      avatar: user ? user.avatar : ''
    };
  });
  const readAt = (chat.readMap && chat.readMap[viewerId]) || null;
  const unreadCount = chat.messages.reduce((count, message) => {
    if (message.authorId === viewerId) return count;
    if (!readAt) return count + 1;
    return new Date(message.createdAt) > new Date(readAt) ? count + 1 : count;
  }, 0);
  const lastMessage = chat.messages[chat.messages.length - 1] || null;
  const messages = chat.messages.slice(-MAX_MESSAGES);
  return {
    id: chat.id,
    participants,
    unreadCount,
    updatedAt: chat.updatedAt,
    lastMessage,
    messages
  };
}

function sendMessage({ fromId, toNickname, toId, content, conversationId }) {
  const db = loadDb();
  const body = sanitizeContent(content);
  if (!body) throw new Error('empty_message');
  const sender = getUserById(fromId);
  if (!sender) throw new Error('sender_not_found');
  let chat = null;
  let recipient = null;
  if (conversationId) {
    chat = db.chats.find((entry) => entry.id === conversationId && entry.participants.includes(sender.id));
    if (!chat) throw new Error('conversation_not_found');
    const peerId = chat.participants.find((id) => id !== sender.id);
    recipient = getUserById(peerId);
  } else {
    if (toId) {
      recipient = getUserById(toId);
    }
    const normalizedNickname = String(toNickname || '').trim();
    if (!recipient && normalizedNickname) {
      recipient = findUserByNickname(normalizedNickname);
    }
    if (!recipient) throw new Error('recipient_not_found');
    if (recipient.id === sender.id) throw new Error('self_message_forbidden');
    chat = ensureChat(db, sender.id, recipient.id);
  }
  if (!recipient) {
    throw new Error('recipient_not_found');
  }
  const message = {
    id: createId('msg-'),
    authorId: sender.id,
    authorNickname: sender.nickname,
    content: body,
    createdAt: new Date().toISOString()
  };
  chat.messages.push(message);
  chat.updatedAt = message.createdAt;
  chat.readMap = chat.readMap || {};
  chat.readMap[sender.id] = message.createdAt;
  const peerId = chat.participants.find((id) => id !== sender.id);
  if (peerId) {
    chat.readMap[peerId] = chat.readMap[peerId] || null;
  }
  if (chat.messages.length > MAX_MESSAGES * 5) {
    chat.messages = chat.messages.slice(-MAX_MESSAGES * 2);
  }
  writeDb(db);
  logAction('direct_message', sender.nickname, { to: recipient.nickname });
  return normalizeChat(chat, sender.id);
}

function listMessages(userId) {
  const db = loadDb();
  const chats = db.chats
    .filter((chat) => chat.participants.includes(userId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((chat) => normalizeChat(chat, userId));
  return chats;
}

function getConversation(conversationId, userId) {
  const db = loadDb();
  const chat = db.chats.find((entry) => entry.id === conversationId && entry.participants.includes(userId));
  if (!chat) throw new Error('conversation_not_found');
  return normalizeChat(chat, userId);
}

function markRead(conversationId, userId) {
  const db = loadDb();
  const chat = db.chats.find((entry) => entry.id === conversationId && entry.participants.includes(userId));
  if (!chat) throw new Error('conversation_not_found');
  chat.readMap = chat.readMap || {};
  chat.readMap[userId] = new Date().toISOString();
  writeDb(db);
  return normalizeChat(chat, userId);
}

module.exports = { sendMessage, listMessages, markRead, getConversation };
