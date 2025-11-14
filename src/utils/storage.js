const fs = require('fs');
const path = require('path');
const { DATA_FILE } = require('../config');

function readDb() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: [],
      sections: [],
      threads: [],
      posts: [],
      complaints: [],
      bans: [],
      logs: [],
      archivedThreads: []
    }, null, 2));
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
