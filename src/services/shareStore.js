'use strict';

// token → { channel, startTime, endTime, filePath, expiresAt, ttl }
const store = new Map();

// Returns the link only if it exists and hasn't expired — avoids repeating
// `if (!link || Date.now() > link.expiresAt)` at every call site that reads one.
store.getValid = function (token) {
  const link = token ? store.get(token) : null;
  if (!link || Date.now() > link.expiresAt) return null;
  return link;
};

module.exports = store;
