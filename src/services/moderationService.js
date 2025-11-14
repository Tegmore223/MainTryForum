const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const { logAction } = require('./logService');

function nicknameById(db, id) {
  if (!id) return 'Аноним';
  const user = db.users.find((u) => u.id === id);
  return user ? user.nickname : 'Аноним';
}

function fileComplaint({ authorId, targetType, targetId, reason }) {
  const db = readDb();
  if (!reason) throw new Error('reason_required');
  if (!targetId) throw new Error('target_required');
  const normalizedType = targetType === 'post' ? 'post' : 'thread';
  const reporter = db.users.find((u) => u.id === authorId);
  const complaint = {
    id: createId('complaint-'),
    authorId,
    authorNickname: reporter ? reporter.nickname : 'Аноним',
    targetType: normalizedType,
    targetId,
    reason,
    status: 'open',
    createdAt: new Date().toISOString()
  };

  if (normalizedType === 'thread') {
    const thread = db.threads.find((t) => t.id === targetId);
    if (!thread) throw new Error('thread_not_found');
    complaint.targetTitle = thread.title;
    complaint.targetAuthorNickname = thread.authorNickname || nicknameById(db, thread.authorId);
    complaint.targetSnippet = (thread.content || '').slice(0, 280);
  } else {
    const post = db.posts.find((p) => p.id === targetId);
    if (!post) throw new Error('post_not_found');
    const thread = db.threads.find((t) => t.id === post.threadId);
    complaint.threadId = post.threadId;
    complaint.targetTitle = thread ? `Ответ в «${thread.title}»` : 'Ответ';
    complaint.targetAuthorNickname = post.authorNickname || nicknameById(db, post.authorId);
    complaint.targetSnippet = (post.content || '').slice(0, 280);
  }

  db.complaints.unshift(complaint);
  writeDb(db);
  return complaint;
}

function listComplaints(role) {
  if (!['admin', 'moderator'].includes(role)) return [];
  const db = readDb();
  return db.complaints.filter((complaint) => complaint.status === 'open');
}

function resolveComplaint(id, actor, result) {
  const db = readDb();
  const complaint = db.complaints.find((c) => c.id === id);
  if (!complaint) throw new Error('Complaint not found');
  complaint.status = result;
  complaint.resolvedBy = actor;
  complaint.resolvedAt = new Date().toISOString();
  writeDb(db);
  logAction('complaint_resolved', actor, { complaintId: id, result });
  return complaint;
}

function banUser({ userId, ip, reason, hours, actor }) {
  const db = readDb();
  const duration = hours ? Number(hours) : 0;
  const ban = {
    id: createId('ban-'),
    userId,
    ip,
    reason,
    expiresAt: duration ? Date.now() + duration * 3600 * 1000 : null,
    createdAt: new Date().toISOString()
  };
  db.bans.push(ban);
  writeDb(db);
  logAction('ban', actor, { userId, ip, reason, hours });
  return ban;
}

function isBanned({ userId, ip }) {
  const db = readDb();
  db.bans = db.bans.filter((ban) => !ban.expiresAt || ban.expiresAt > Date.now());
  writeDb(db);
  return db.bans.some((ban) => (userId && ban.userId === userId) || (ip && ban.ip === ip));
}

module.exports = { fileComplaint, listComplaints, resolveComplaint, banUser, isBanned };
