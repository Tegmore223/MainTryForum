const { readDb } = require('../utils/storage');

function dayRange(offset) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function within(date, range) {
  const value = new Date(date);
  return value >= range.start && value < range.end;
}

function forumStats() {
  const db = readDb();
  const timeline = [];
  for (let i = 6; i >= 0; i -= 1) {
    const range = dayRange(i);
    timeline.push({
      label: range.start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      threads: db.threads.filter((thread) => within(thread.createdAt, range)).length,
      posts: db.posts.filter((post) => within(post.createdAt, range)).length,
      registrations: db.users.filter((user) => within(user.createdAt, range)).length
    });
  }

  const topSections = db.sections
    .map((section) => ({
      sectionId: section.id,
      title: section.title,
      threads: db.threads.filter((thread) => thread.sectionId === section.id).length
    }))
    .sort((a, b) => b.threads - a.threads)
    .slice(0, 5);

  return {
    counts: {
      users: db.users.length,
      sections: db.sections.length,
      threads: db.threads.length,
      posts: db.posts.length,
      complaints: db.complaints.length,
      bans: db.bans.length
    },
    timeline,
    topSections
  };
}

module.exports = { forumStats };
