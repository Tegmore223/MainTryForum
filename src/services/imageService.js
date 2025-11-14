const { MAX_IMAGE_BYTES } = require('../config');
const { createId } = require('../utils/id');
const fs = require('fs');
const path = require('path');

const avatarDir = path.join(__dirname, '..', '..', 'public', 'assets', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

function saveBase64Image(data) {
  if (!data) return null;
  const matches = data.match(/^data:(image\/(png|jpeg|gif));base64,(.+)$/);
  if (!matches) {
    throw new Error('Unsupported image format');
  }
  const mime = matches[1];
  const body = matches[3];
  const buffer = Buffer.from(body, 'base64');
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds limit');
  }
  const id = createId('avatar-');
  const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : 'gif';
  const filePath = path.join(avatarDir, `${id}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return `/assets/avatars/${id}.${ext}`;
}

module.exports = { saveBase64Image };
