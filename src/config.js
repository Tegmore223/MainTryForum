const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  DATA_FILE: path.join(__dirname, '..', 'data', 'database.json'),
  LOG_FILE: path.join(__dirname, '..', 'logs', 'admin.log'),
  JWT_SECRET: process.env.JWT_SECRET || 'opweb-secret-key',
  TOKEN_EXPIRY_MS: 1000 * 60 * 60 * 24 * 7,
  CAPTCHA_EXPIRY_MS: 1000 * 60 * 5,
  CACHE_TTL_MS: 1000 * 60,
  RATE_LIMIT_WINDOW_MS: 1000 * 60,
  RATE_LIMIT_MAX: 120,
  MAX_IMAGE_BYTES: 1024 * 400,
  MAX_IMAGE_DIM: 1024,
  ADMIN_LOGIN: 'tegmore',
  ADMIN_PASSWORD: 'public242',
  ADMIN_BACKUP_PASSWORD: 'personal242273',
  DATA_SECRET: process.env.DATA_SECRET || 'opweb-data-secret',
  EMAIL_HOST: process.env.EMAIL_HOST || '',
  EMAIL_PORT: Number(process.env.EMAIL_PORT || 465),
  EMAIL_SECURE: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : true,
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || '',
  EMAIL_FROM: process.env.EMAIL_FROM || 'OP.WEB <no-reply@opweb>',
  ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL || 'security@opweb.local'
};
