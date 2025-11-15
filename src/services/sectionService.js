const { readDb, writeDb } = require('../utils/storage');
const { createId } = require('../utils/id');
const cache = require('./cacheService');

function listSections() {
  const cacheKey = 'sections:list';
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const db = readDb();
  cache.set(cacheKey, db.sections);
  return db.sections;
}

function addSection({ title, description }) {
  const db = readDb();
  const section = {
    id: createId('sec-'),
    title,
    description,
    createdAt: new Date().toISOString()
  };
  db.sections.push(section);
  writeDb(db);
  cache.invalidate('sections');
  return section;
}

function updateSection(id, payload) {
  const db = readDb();
  const idx = db.sections.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('Section not found');
  db.sections[idx] = { ...db.sections[idx], ...payload };
  writeDb(db);
  cache.invalidate('sections');
  return db.sections[idx];
}

module.exports = { listSections, addSection, updateSection };
