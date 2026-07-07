'use strict';

// token → { channel, startTime, endTime, filePath, expiresAt, ttl }
const store = new Map();

// Zwraca link tylko jeśli istnieje i nie wygasł — zamiast powtarzać
// `if (!link || Date.now() > link.expiresAt)` w każdym miejscu, które go czyta.
store.getValid = function (token) {
  const link = token ? store.get(token) : null;
  if (!link || Date.now() > link.expiresAt) return null;
  return link;
};

module.exports = store;
