const { CACHE_TTL_MS } = require('../config');

class CacheService {
  constructor() {
    this.store = new Map();
  }

  set(key, value, ttl = CACHE_TTL_MS) {
    const expires = Date.now() + ttl;
    this.store.set(key, { value, expires });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  invalidate(pattern) {
    [...this.store.keys()].forEach((key) => {
      if (pattern === '*' || key.startsWith(pattern)) {
        this.store.delete(key);
      }
    });
  }
}

module.exports = new CacheService();
