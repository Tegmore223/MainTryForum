const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');
const { parseBody, sendJson } = require('./utils/request');
const rateLimiter = require('./middleware/rateLimiter');
const { ensureDefaultAdmin, createUser, authenticate, updateUser, listUsers, getUserById } = require('./services/userService');
const { signToken, verifyToken } = require('./utils/crypto');
const { listSections, addSection } = require('./services/sectionService');
const threadService = require('./services/threadService');
const moderationService = require('./services/moderationService');
const { forumStats } = require('./services/statService');
const { saveBase64Image, saveUiAsset } = require('./services/imageService');
const { fileComplaint } = moderationService;
const { readDb, writeDb } = require('./utils/storage');
const { createId } = require('./utils/id');
const { logAction } = require('./services/logService');
const { PORT, CAPTCHA_EXPIRY_MS, ADMIN_LOGIN, ADMIN_PASSWORD, ADMIN_BACKUP_PASSWORD } = require('./config');

ensureDefaultAdmin();

const captchaStore = new Map();
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseCookies(req) {
  const header = req.headers['cookie'];
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const [key, value] = pair.trim().split('=');
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getAuthUser(req) {
  const cookies = parseCookies(req);
  const token = cookies['opweb_token'];
  const payload = verifyToken(token);
  if (!payload) return null;
  return getUserById(payload.userId);
}

function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'auth_required' });
    return null;
  }
  return user;
}

function requireRole(user, res, roles) {
  if (!roles.includes(user.role)) {
    sendJson(res, 403, { error: 'forbidden' });
    return false;
  }
  return true;
}

function findAdminId() {
  const db = readDb();
  const admin = db.users.find((u) => u.nickname === ADMIN_LOGIN);
  return admin ? admin.id : null;
}

function cleanExpiredCaptchas() {
  const now = Date.now();
  [...captchaStore.entries()].forEach(([key, value]) => {
    if (value.expires < now) captchaStore.delete(key);
  });
}

setInterval(cleanExpiredCaptchas, 10000);

function serveStatic(req, res) {
  let filePath = path.join(__dirname, '..', 'public', req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(path.join(__dirname, '..', 'public'))) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const type = mimeTypes[ext] || 'application/octet-stream';
    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (acceptEncoding.includes('br')) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'br' });
      res.end(zlib.brotliCompressSync(data));
      return;
    }
    if (acceptEncoding.includes('gzip')) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip' });
      res.end(zlib.gzipSync(data));
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method.toUpperCase();
  const pathname = parsedUrl.pathname;
  const ip = req.ip;

  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!rateLimiter(req, res)) return;

  if (pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (pathname === '/api/settings/public' && method === 'GET') {
    const db = readDb();
    sendJson(res, 200, { settings: db.settings || { title: 'OP.WEB', logo: '' } });
    return;
  }

  if (pathname === '/api/stats' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    sendJson(res, 200, forumStats());
    return;
  }

  if (pathname === '/api/auth/captcha' && method === 'GET') {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const captchaId = createId('captcha-');
    captchaStore.set(captchaId, { answer: String(a + b), expires: Date.now() + CAPTCHA_EXPIRY_MS });
    sendJson(res, 200, { captchaId, question: `${a} + ${b} = ?` });
    return;
  }

  if (pathname === '/api/auth/register' && method === 'POST') {
    const body = await parseBody(req);
    const { nickname, password, email, captchaId, captchaAnswer } = body;
    if (!nickname || !password || !captchaId || !captchaAnswer) {
      sendJson(res, 400, { error: 'missing_fields' });
      return;
    }
    const record = captchaStore.get(captchaId);
    if (!record || record.answer !== String(captchaAnswer)) {
      sendJson(res, 400, { error: 'captcha_invalid' });
      return;
    }
    captchaStore.delete(captchaId);
    const user = createUser({ nickname, password, email, ip });
    const token = signToken({ userId: user.id });
    setCookie(res, 'opweb_token', token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    sendJson(res, 201, { user: { nickname: user.nickname, id: user.id } });
    return;
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req);
    const { nickname, password } = body;
    let user = authenticate(nickname, password);
    if (!user && nickname === ADMIN_LOGIN && password === ADMIN_BACKUP_PASSWORD) {
      const adminId = findAdminId();
      if (adminId) {
        user = getUserById(adminId);
      }
    }
    if (!user) {
      sendJson(res, 401, { error: 'invalid_credentials' });
      return;
    }
    const token = signToken({ userId: user.id });
    setCookie(res, 'opweb_token', token, { httpOnly: true, sameSite: 'Strict', path: '/' });
    sendJson(res, 200, { user: { nickname: user.nickname, role: user.role } });
    return;
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    setCookie(res, 'opweb_token', '', { httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 0 });
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (pathname === '/api/me' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const dbUser = getUserById(user.id);
    sendJson(res, 200, { user: dbUser });
    return;
  }

  if (pathname === '/api/profile/theme' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const updated = updateUser(user.id, { theme: body.theme || 'light' });
    sendJson(res, 200, { theme: updated.theme });
    return;
  }

  if (pathname === '/api/profile/avatar' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    let url;
    try {
      url = saveBase64Image(body.avatar);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
      return;
    }
    const updated = updateUser(user.id, { avatar: url });
    sendJson(res, 200, { avatar: updated.avatar });
    return;
  }

  if (pathname === '/api/profile/nickname' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const db = readDb();
    if (db.users.some((u) => u.nickname.toLowerCase() === body.nickname.toLowerCase() && u.id !== user.id)) {
      sendJson(res, 400, { error: 'nickname_taken' });
      return;
    }
    const updated = updateUser(user.id, { nickname: body.nickname });
    sendJson(res, 200, { nickname: updated.nickname });
    return;
  }

  if (pathname === '/api/sections' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const sections = listSections();
    sendJson(res, 200, { sections });
    return;
  }

  if (pathname === '/api/library' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    const library = threadService.collectUserLibrary(user.id);
    sendJson(res, 200, library);
    return;
  }

  if (pathname === '/api/sections' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const body = await parseBody(req);
    const section = addSection(body);
    logAction('add_section', user.nickname, { sectionId: section.id });
    sendJson(res, 201, { section });
    return;
  }

  if (pathname.startsWith('/api/threads') && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (pathname === '/api/threads') {
      const { sectionId, page } = parsedUrl.query;
      const payload = threadService.listThreads({ sectionId, page: Number(page) || 1 });
      sendJson(res, 200, payload);
      return;
    }
    const threadId = pathname.split('/').pop();
    threadService.incrementView(threadId, user.id);
    const thread = threadService.getThread(threadId);
    if (!thread) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    sendJson(res, 200, thread);
    return;
  }

  if (pathname === '/api/threads' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const banned = moderationService.isBanned({ userId: user.id, ip });
    if (banned) {
      sendJson(res, 403, { error: 'banned' });
      return;
    }
    const thread = threadService.createThread({ ...body, authorId: user.id });
    sendJson(res, 201, thread);
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/reply/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const parts = pathname.split('/');
    const threadId = parts[3];
    const body = await parseBody(req);
    if (moderationService.isBanned({ userId: user.id, ip })) {
      sendJson(res, 403, { error: 'banned' });
      return;
    }
    try {
      const post = threadService.replyThread({ threadId, content: body.content, parentId: body.parentId, authorId: user.id });
      sendJson(res, 201, post);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/react/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const parts = pathname.split('/');
    const threadId = parts[3];
    try {
      const thread = threadService.toggleReaction({ threadId, userId: user.id, type: body.type });
      sendJson(res, 200, thread);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/block/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const threadId = pathname.split('/')[3];
    try {
      const thread = threadService.lockThread(threadId, user.nickname);
      sendJson(res, 200, thread);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/unblock/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const threadId = pathname.split('/')[3];
    try {
      const thread = threadService.unlockThread(threadId, user.nickname);
      sendJson(res, 200, thread);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/archive/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const threadId = pathname.split('/')[3];
    try {
      const thread = threadService.archiveThread(threadId, user.nickname);
      sendJson(res, 200, thread);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/freeze/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const threadId = pathname.split('/')[3];
    try {
      const thread = threadService.freezeThread(threadId, user.nickname);
      sendJson(res, 200, thread);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname.match(/\/api\/threads\/[^/]+\/delete/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const threadId = pathname.split('/')[3];
    try {
      threadService.deleteThread(threadId, user.nickname);
      sendJson(res, 200, { status: 'deleted' });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/complaints' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    try {
      const complaint = fileComplaint({ ...body, targetType: body.targetType || 'thread', authorId: user.id });
      sendJson(res, 201, complaint);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/complaints' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const complaints = moderationService.listComplaints(user.role);
    sendJson(res, 200, { complaints });
    return;
  }

  if (pathname.match(/\/api\/complaints\/[^/]+\/resolve/) && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const id = pathname.split('/')[3];
    const body = await parseBody(req);
    try {
      const result = moderationService.resolveComplaint(id, user.nickname, body.result);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (pathname === '/api/admin/assign-role' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const body = await parseBody(req);
    const target = getUserById(body.userId);
    if (!target) {
      sendJson(res, 404, { error: 'user_not_found' });
      return;
    }
    const updated = updateUser(target.id, { role: body.role });
    logAction('assign_role', user.nickname, { userId: updated.id, role: body.role });
    sendJson(res, 200, updated);
    return;
  }

  if (pathname === '/api/admin/logs' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const logs = fs.existsSync(path.join(__dirname, '..', 'logs', 'admin.log'))
      ? fs.readFileSync(path.join(__dirname, '..', 'logs', 'admin.log'), 'utf-8').split('\n').filter(Boolean)
      : [];
    sendJson(res, 200, { logs });
    return;
  }

  if (pathname === '/api/admin/settings' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const db = readDb();
    sendJson(res, 200, { settings: db.settings });
    return;
  }

  if (pathname === '/api/admin/settings' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const body = await parseBody(req);
    const db = readDb();
    const settings = { ...db.settings };
    if (typeof body.title === 'string') {
      settings.title = body.title.trim().slice(0, 80) || settings.title;
    }
    if (body.removeLogo) {
      settings.logo = '';
    } else if (body.logo) {
      try {
        settings.logo = saveUiAsset(body.logo);
      } catch (err) {
        sendJson(res, 400, { error: err.message });
        return;
      }
    }
    db.settings = settings;
    writeDb(db);
    logAction('update_settings', user.nickname, { title: settings.title, hasLogo: Boolean(settings.logo) });
    sendJson(res, 200, { settings });
    return;
  }

  if (pathname === '/api/admin/stats' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    sendJson(res, 200, forumStats());
    return;
  }

  if (pathname === '/api/admin/threads' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const { sectionId, limit } = parsedUrl.query;
    const threads = threadService.listRecentThreads({ sectionId, limit: Math.min(Number(limit) || 25, 100) });
    sendJson(res, 200, { threads });
    return;
  }

  if (pathname === '/api/admin/archive' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const db = readDb();
    sendJson(res, 200, { archivedThreads: db.archivedThreads });
    return;
  }

  if (pathname === '/api/admin/users/export' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const users = listUsers();
    const csv = ['nickname,id,email,ip'].concat(users.map((u) => `${u.nickname},${u.id},${u.email || ''},${u.ip || ''}`)).join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="users.csv"'
    });
    res.end(csv);
    return;
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const users = listUsers().map((entry) => ({
      nickname: entry.nickname,
      id: entry.id,
      email: entry.email,
      ip: entry.ip,
      createdAt: entry.createdAt
    }));
    sendJson(res, 200, { users });
    return;
  }

  if (pathname === '/api/admin/ban' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin'])) return;
    const body = await parseBody(req);
    const ban = moderationService.banUser({ ...body, actor: user.nickname });
    sendJson(res, 201, ban);
    return;
  }

  if (pathname === '/api/mod/ban' && method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!requireRole(user, res, ['admin', 'moderator'])) return;
    const body = await parseBody(req);
    const ban = moderationService.banUser({ ...body, actor: user.nickname });
    sendJson(res, 201, ban);
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  req.ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress;
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: 'internal_error' });
    });
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`OP.WEB listening on port ${PORT}`);
});
