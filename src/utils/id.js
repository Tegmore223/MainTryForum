const { randomBytes } = require('crypto');

function createId(prefix = '') {
  return `${prefix}${randomBytes(8).toString('hex')}`;
}

module.exports = { createId };
