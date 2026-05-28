'use strict';
const fs = require('fs');
const shareStore = require('../services/shareStore');
const streamStore = require('../services/streamStore');

const STREAM_TTL = 2 * 60 * 60 * 1000;

function startCleanupJob() {
  setInterval(() => {
    const now = Date.now();

    shareStore.forEach((link, token) => {
      if (now > link.expiresAt) shareStore.delete(token);
    });

    streamStore.forEach((job, token) => {
      if (job.endedAt && now - job.endedAt > STREAM_TTL) {
        try { fs.rmSync(job.outFile, { force: true }); } catch {}
        streamStore.delete(token);
        console.log(`[gc] usunięto stream ${token}`);
      }
    });
  }, 5 * 60 * 1000);
}

module.exports = startCleanupJob;
