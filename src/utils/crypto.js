const { randomBytes, pbkdf2Sync, createHmac } = require('crypto');
const { JWT_SECRET, TOKEN_EXPIRY_MS } = require('../config');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const computed = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === computed;
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + TOKEN_EXPIRY_MS;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const unsigned = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const unsigned = `${header}.${body}`;
  const expected = createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp && payload.exp < Date.now()) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
