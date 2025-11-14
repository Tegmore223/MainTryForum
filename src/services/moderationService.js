const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const { logAction } = require('./logService');

function fileComplaint({ authorId, targetType, targetId, reason }) {
  const db = readDb();
  const complaint = {
    id: createId('complaint-'),
    authorId,
    targetType,
    targetId,
    reason,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  db.complaints.push(complaint);
  writeDb(db);
  return complaint;
}

function listComplaints(role) {
  if (!['admin', 'moderator'].includes(role)) return [];
  const db = readDb();
  return db.complaints;
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
