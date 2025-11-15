const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const { hashPassword, verifyPassword } = require('../utils/crypto');
const cache = require('./cacheService');
const { logAction } = require('./logService');
const { ADMIN_LOGIN, ADMIN_PASSWORD, ADMIN_ALERT_EMAIL } = require('../config');
const { ADMIN_LOGIN, ADMIN_PASSWORD } = require('../config');

function computeBadges(user) {
  const badges = [];
  if ((user.reputation || 0) >= 10) badges.push('Уважение');
  if ((user.answers || 0) >= 5) badges.push('Лектор');
  if ((user.favorites || []).length >= 5) badges.push('Коллекционер');
  return badges;
}

function ensureDefaultAdmin() {
  const db = readDb();
  let admin = db.users.find((u) => u.nickname === ADMIN_LOGIN);
  if (!admin) {
    admin = {
      id: createId('user-'),
      nickname: ADMIN_LOGIN,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      email: ADMIN_ALERT_EMAIL || '',
      email: '',
      ip: 'system',
      role: 'admin',
      createdAt: new Date().toISOString(),
      reputation: 0,
      likes: 0,
      thanks: 0,
      favorites: [],
      answers: 0,
      theme: 'dark',
      avatar: '',
      badges: []
    };
    admin.badges = computeBadges(admin);
    db.users.push(admin);
    writeDb(db);
    logAction('seed_admin', 'system', { nickname: ADMIN_LOGIN });
  }
}

function createUser({ nickname, password, email, ip }) {
  const db = readDb();
  const cleanNickname = String(nickname || '').trim();
  if (!cleanNickname) {
    throw new Error('Nickname required');
  }
  if (db.users.some((u) => u.nickname.toLowerCase() === cleanNickname.toLowerCase())) {
  if (db.users.some((u) => u.nickname.toLowerCase() === nickname.toLowerCase())) {
    throw new Error('Nickname already taken');
  }
  const newUser = {
    id: createId('user-'),
    nickname: cleanNickname,
    nickname,
    passwordHash: hashPassword(password),
    email: email || '',
    ip,
    role: 'user',
    createdAt: new Date().toISOString(),
    reputation: 0,
    likes: 0,
    thanks: 0,
    favorites: [],
    answers: 0,
    theme: 'dark',
    avatar: '',
    badges: []
  };
  newUser.badges = computeBadges(newUser);
  db.users.push(newUser);
  writeDb(db);
  cache.invalidate('users');
  return newUser;
}

function findUserByNickname(nickname) {
  const db = readDb();
  return db.users.find((u) => u.nickname.toLowerCase() === nickname.toLowerCase());
}

function getUserById(id) {
  const db = readDb();
  return db.users.find((u) => u.id === id);
}

function authenticate(nickname, password) {
  const user = findUserByNickname(nickname);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}

function updateUser(id, updates) {
  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('User not found');
  const current = db.users[idx];
  const next = { ...current, ...updates };
  if (updates.nickname) {
    const cleanNickname = updates.nickname.trim();
    if (!cleanNickname) throw new Error('Nickname required');
    const duplicate = db.users.find((u) => u.nickname.toLowerCase() === cleanNickname.toLowerCase() && u.id !== id);
    if (duplicate) {
      throw new Error('nickname_taken');
    }
    next.nickname = cleanNickname;
  }
  db.users[idx] = next;
  db.users[idx] = { ...db.users[idx], ...updates };
  db.users[idx].badges = computeBadges(db.users[idx]);
  writeDb(db);
  cache.invalidate('users');
  return db.users[idx];
}

function listUsers() {
  const cacheKey = 'users:list';
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const db = readDb();
  cache.set(cacheKey, db.users);
  return db.users;
}

module.exports = {
  ensureDefaultAdmin,
  createUser,
  findUserByNickname,
  authenticate,
  updateUser,
  listUsers,
  getUserById,
  computeBadges
};
