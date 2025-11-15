const { MAX_IMAGE_BYTES } = require('../config');
const { createId } = require('../utils/id');
const fs = require('fs');
const path = require('path');

const avatarDir = path.join(__dirname, '..', '..', 'public', 'assets', 'avatars');
const uiDir = path.join(__dirname, '..', '..', 'public', 'assets', 'ui');

if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}
if (!fs.existsSync(uiDir)) {
  fs.mkdirSync(uiDir, { recursive: true });
}

function parseImage(data, allowed = ['png', 'jpeg', 'gif']) {
  if (!data) return null;
  const matches = data.match(/^data:(image\/(png|jpeg|gif));base64,(.+)$/);
  if (!matches) {
    throw new Error('Unsupported image format');
  }
  const mime = matches[1];
  const extension = mime.split('/')[1];
  if (!allowed.some((type) => mime.includes(type))) {
    throw new Error('Unsupported image format');
  }
  const body = matches[3];
  const buffer = Buffer.from(body, 'base64');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds limit');
  }
  return { buffer, mime, extension };
}

function saveBase64Image(data) {
  const parsed = parseImage(data);
  if (!parsed) return null;
  const { buffer, mime } = parsed;
  const id = createId('avatar-');
  const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'gif';
  const filePath = path.join(avatarDir, `${id}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return `/assets/avatars/${id}.${ext}`;
}

function saveUiAsset(data) {
  const parsed = parseImage(data, ['png']);
  if (!parsed) return null;
  const id = createId('logo-');
  const filePath = path.join(uiDir, `${id}.png`);
  fs.writeFileSync(filePath, parsed.buffer);
  return `/assets/ui/${id}.png`;
}

module.exports = { saveBase64Image, saveUiAsset };
