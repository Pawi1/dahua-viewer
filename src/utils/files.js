'use strict';
const fs = require('fs');

function fileSize(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForFileBytes(file, minBytes, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fileSize(file) >= minBytes) return true;
    await sleep(150);
  }
  return false;
}

module.exports = { fileSize, sleep, waitForFileBytes };
