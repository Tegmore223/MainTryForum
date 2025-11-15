const fs = require('fs');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('crypto');
const { DATA_FILE, DATA_SECRET } = require('../config');

const SIGNATURE = Buffer.from('OPWEB1');
const KEY = createHash('sha256').update(DATA_SECRET).digest();

function encryptPayload(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([SIGNATURE, iv, tag, encrypted]).toString('base64');
}

function decryptPayload(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return '{}';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }
  const buffer = Buffer.from(trimmed, 'base64');
  const signature = buffer.subarray(0, SIGNATURE.length).toString();
  if (signature !== SIGNATURE.toString()) {
    throw new Error('Invalid data signature');
  }
  const iv = buffer.subarray(SIGNATURE.length, SIGNATURE.length + 12);
  const tag = buffer.subarray(SIGNATURE.length + 12, SIGNATURE.length + 28);
  const encrypted = buffer.subarray(SIGNATURE.length + 28);
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function ensureDefaults(payload) {
  if (!payload.settings) {
    payload.settings = {
      title: 'OP.WEB',
      logo: ''
    };
  }
  payload.messages = payload.messages || [];
  payload.complaints = payload.complaints || [];
  payload.bans = payload.bans || [];
  payload.threads = payload.threads || [];
  payload.posts = payload.posts || [];
  return payload;
}

function readDb() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          users: [],
          sections: [],
          threads: [],
          posts: [],
          complaints: [],
          bans: [],
          logs: [],
          archivedThreads: [],
          messages: [],
          settings: {
            title: 'OP.WEB',
            logo: ''
          }
        },
        null,
        2
      )
    );
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const decoded = decryptPayload(raw);
  const payload = JSON.parse(decoded);
  return ensureDefaults(payload);
}

function writeDb(data) {
  const encrypted = encryptPayload(JSON.stringify(data));
  fs.writeFileSync(DATA_FILE, encrypted);
}

module.exports = { readDb, writeDb };
