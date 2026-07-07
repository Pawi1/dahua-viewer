'use strict';
const fs = require('fs');

// Nagrania na NVR-ze zawsze leżą pod /mnt/<dysk>/... (patrz Dahua mediaFileFind
// FilePath, np. "/mnt/dvr/sda0/2010/8/11/dav/15:40:50.jpg"). Zamiast wycinać ".."
// (co nie blokuje ścieżek bezwzględnych spoza tego katalogu), wymagamy zgodności
// z tym wzorcem w całości i odrzucamy wszystko inne.
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
