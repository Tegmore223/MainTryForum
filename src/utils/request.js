const { StringDecoder } = require('string_decoder');

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    const decoder = new StringDecoder('utf-8');
    req.on('data', (chunk) => {
      data += decoder.write(chunk);
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      data += decoder.end();
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

module.exports = { parseBody, sendJson };
