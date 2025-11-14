const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const cache = require('./cacheService');
const queue = require('./queueService');
const { logAction } = require('./logService');
const { saveBase64Image } = require('./imageService');

function listThreads({ sectionId, page = 1, limit = 20 }) {
  const cacheKey = `threads:${sectionId}:${page}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const db = readDb();
  const threads = db.threads.filter((t) => t.sectionId === sectionId && !t.archived);
  const total = threads.length;
  const start = (page - 1) * limit;
  const sliced = threads.slice(start, start + limit);
  const payload = { items: sliced, total };
  cache.set(cacheKey, payload);
  return payload;
}

function getThread(id) {
  const cacheKey = `thread:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const db = readDb();
  const thread = db.threads.find((t) => t.id === id);
  if (!thread) return null;
  const posts = db.posts.filter((p) => p.threadId === id);
  const payload = { ...thread, posts };
  cache.set(cacheKey, payload);
  return payload;
}

function createThread({ sectionId, title, content, authorId, format, attachment }) {
  const db = readDb();
  const thread = {
    id: createId('thread-'),
    sectionId,
    title,
    content,
    format: format || 'markdown',
    authorId,
    createdAt: new Date().toISOString(),
    likes: [],
    thanks: [],
    favorites: [],
    locked: false,
    archived: false,
    highlight: false,
    stats: { replies: 0 },
    banner: ''
  };
  if (attachment) {
    const threadId = thread.id;
    queue.add(async () => {
      const banner = saveBase64Image(attachment);
      const fresh = readDb();
      const idx = fresh.threads.findIndex((t) => t.id === threadId);
      if (idx !== -1) {
        fresh.threads[idx].banner = banner;
        writeDb(fresh);
        cache.invalidate(`thread:${threadId}`);
      }
    });
  }
  db.threads.unshift(thread);
  writeDb(db);
  cache.invalidate('threads');
  return thread;
}

function replyThread({ threadId, content, authorId, parentId }) {
  const db = readDb();
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error('Thread not found');
  if (thread.locked) throw new Error('Thread locked');
  const post = {
    id: createId('post-'),
    threadId,
    content,
    authorId,
    parentId: parentId || null,
    createdAt: new Date().toISOString(),
    likes: [],
    thanks: []
  };
  db.posts.push(post);
  thread.stats.replies += 1;
  const responder = db.users.find((u) => u.id === authorId);
  if (responder) {
    responder.answers = (responder.answers || 0) + 1;
  }
  writeDb(db);
  cache.invalidate(`thread:${threadId}`);
  return post;
}

function toggleReaction({ threadId, userId, type }) {
  const db = readDb();
  const thread = db.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error('Thread not found');
  const field = type === 'like' ? 'likes' : type === 'thanks' ? 'thanks' : 'favorites';
  const arr = thread[field];
  const idx = arr.indexOf(userId);
  if (idx === -1) {
    arr.push(userId);
    adjustUserStats(db, thread, userId, type, true);
  } else {
    arr.splice(idx, 1);
    adjustUserStats(db, thread, userId, type, false);
  }
  writeDb(db);
  cache.invalidate(`thread:${threadId}`);
  cache.invalidate(`threads:${thread.sectionId}`);
  return thread;
}

function adjustUserStats(db, thread, actorId, type, added) {
  const author = db.users.find((u) => u.id === thread.authorId);
  const actor = db.users.find((u) => u.id === actorId);
  const repMap = { like: 1, thanks: 3, favorite: 2 };
  const delta = repMap[type] || 0;
  if (author && delta) {
    author.reputation = Math.max(0, (author.reputation || 0) + (added ? delta : -delta));
    if (type === 'like') author.likes = thread.likes.length;
    if (type === 'thanks') author.thanks = thread.thanks.length;
  }
  if (type === 'favorite' && actor) {
    actor.favorites = actor.favorites || [];
    if (added) {
      if (!actor.favorites.includes(thread.id)) actor.favorites.push(thread.id);
    } else {
      actor.favorites = actor.favorites.filter((id) => id !== thread.id);
    }
  }
}

function lockThread(id, actor) {
  const db = readDb();
  const thread = db.threads.find((t) => t.id === id);
  if (!thread) throw new Error('Thread not found');
  thread.locked = true;
  thread.content = 'Этот тред был удалён за нарушение правил.';
  writeDb(db);
  cache.invalidate(`thread:${id}`);
  logAction('lock_thread', actor, { threadId: id });
  return thread;
}

function archiveThread(id, actor) {
  const db = readDb();
  const idx = db.threads.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('Thread not found');
  const [thread] = db.threads.splice(idx, 1);
  thread.archived = true;
  db.archivedThreads.push(thread);
  writeDb(db);
  cache.invalidate('threads');
  logAction('archive_thread', actor, { threadId: id });
  return thread;
}

module.exports = {
  listThreads,
  getThread,
  createThread,
  replyThread,
  toggleReaction,
  lockThread,
  archiveThread
};
