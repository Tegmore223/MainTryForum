const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = require('../config');

const buckets = new Map();

function rateLimiter(req, res) {
  const ip = req.ip;
  const entry = buckets.get(ip) || { count: 0, reset: Date.now() + RATE_LIMIT_WINDOW_MS };
  if (entry.reset < Date.now()) {
    entry.count = 0;
    entry.reset = Date.now() + RATE_LIMIT_WINDOW_MS;
  }
  entry.count += 1;
  buckets.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return false;
  }
  return true;
}

module.exports = rateLimiter;
