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
  ADMIN_BACKUP_PASSWORD: 'personal242273'
};
