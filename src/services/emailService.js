const net = require('net');
const tls = require('tls');
const { EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM } = require('../config');
const { logAction } = require('./logService');

function sendRaw(socket, command) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (/\r?\n$/.test(buffer)) {
        socket.removeListener('data', onData);
        const code = parseInt(buffer.slice(0, 3), 10);
        if (Number.isNaN(code) || code >= 400) {
          reject(new Error(buffer.trim()));
        } else {
          resolve(buffer.trim());
        }
      }
    };
    socket.once('error', reject);
    socket.on('data', onData);
    socket.write(`${command}\r\n`);
  });
}

async function smtpSend({ to, subject, text }) {
  if (!EMAIL_HOST) {
    console.info(`[mail disabled] ${subject} → ${to}: ${text}`);
    return;
  }
  const secure = EMAIL_SECURE !== false;
  const socket = secure
    ? tls.connect({ host: EMAIL_HOST, port: EMAIL_PORT, rejectUnauthorized: false })
    : net.createConnection({ host: EMAIL_HOST, port: EMAIL_PORT });
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('connect', resolve);
    socket.once('secureConnect', resolve);
  });
  await new Promise((resolve, reject) => {
    socket.once('data', (chunk) => {
      const code = parseInt(chunk.toString().slice(0, 3), 10);
      if (Number.isNaN(code) || code >= 400) reject(new Error(chunk.toString()));
      else resolve();
    });
  });
  await sendRaw(socket, `EHLO opweb.local`);
  if (EMAIL_USER && EMAIL_PASSWORD) {
    await sendRaw(socket, 'AUTH LOGIN');
    await sendRaw(socket, Buffer.from(EMAIL_USER).toString('base64'));
    await sendRaw(socket, Buffer.from(EMAIL_PASSWORD).toString('base64'));
  }
  await sendRaw(socket, `MAIL FROM:<${EMAIL_FROM.replace(/.*<|>/g, '')}>`);
  await sendRaw(socket, `RCPT TO:<${to}>`);
  await sendRaw(socket, 'DATA');
  const lines = [
    `From: ${EMAIL_FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '.',
  ];
  await sendRaw(socket, lines.join('\r\n'));
  await sendRaw(socket, 'QUIT');
  socket.end();
}

async function sendTwoFactorCode(email, code) {
  if (!email) {
    console.warn('Нет e-mail для отправки 2FA кода');
    return;
  }
  const subject = 'OP.WEB — код подтверждения';
  const text = `Ваш код подтверждения: ${code}\nКод действителен в течение нескольких минут.`;
  try {
    await smtpSend({ to: email, subject, text });
    logAction('two_factor_sent', 'system', { email });
  } catch (err) {
    console.error('Не удалось отправить письмо', err.message);
  }
}

module.exports = { sendTwoFactorCode };
