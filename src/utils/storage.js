const fs = require('fs');
const path = require('path');
const { DATA_FILE } = require('../config');

function ensureDefaults(payload) {
  if (!payload.settings) {
    payload.settings = {
      title: 'OP.WEB',
      logo: ''
    };
  }
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
  const payload = JSON.parse(raw);
  return ensureDefaults(payload);
}

function writeDb(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
