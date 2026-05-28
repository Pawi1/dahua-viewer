'use strict';
const crypto = require('crypto');

function genToken(len = 24) {
  return crypto.randomBytes(len).toString('hex');
}

module.exports = { genToken };
