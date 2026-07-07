'use strict';
const fs = require('fs');

// Recordings on the NVR always live under /mnt/<disk>/... (see Dahua
// mediaFileFind's FilePath, e.g. "/mnt/dvr/sda0/2010/8/11/dav/15:40:50.jpg").
// Instead of stripping ".." (which doesn't block absolute paths outside that
// directory), require the whole path to match this shape and reject anything else.
const SAFE_NVR_PATH = /^\/mnt\/[\w\-./:[\]@]+$/;

function sanitizeNvrPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) return null;
  if (filePath.includes('..')) return null;
  if (!SAFE_NVR_PATH.test(filePath)) return null;
  return filePath;
}

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

module.exports = { sanitizeNvrPath, fileSize, sleep, waitForFileBytes };
