const fs = require('fs');
const { LOG_FILE } = require('../config');

function logAction(action, actor, details) {
  const entry = `${new Date().toISOString()} | ${actor} | ${action} | ${JSON.stringify(details)}\n`;
  fs.appendFileSync(LOG_FILE, entry);
}

module.exports = { logAction };
