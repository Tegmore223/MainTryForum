const { readDb } = require('../utils/storage');

function forumStats() {
  const db = readDb();
  return {
    users: db.users.length,
    sections: db.sections.length,
    threads: db.threads.length,
    posts: db.posts.length,
    complaints: db.complaints.length,
    bans: db.bans.length
  };
}

module.exports = { forumStats };
