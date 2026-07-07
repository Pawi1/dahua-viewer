'use strict';
const shareStore   = require('../services/shareStore');
const streamStore  = require('../services/streamStore');
const sessionStore = require('../services/sessionStore');
const go2rtc       = require('../services/go2rtcApi');

const SHARE_TTL       = 0;               // expiry tracked in link itself
const STREAM_MEM_TTL  = 2 * 60 * 60 * 1000; // 2h — usuń z pamięci po zakończeniu
const HEARTBEAT_TTL   = 60 * 1000;           // 60s bez pingu → ubij stream

function startCleanupJob() {
  setInterval(async () => {
    const now = Date.now();

    shareStore.forEach((link, token) => {
      if (now > link.expiresAt) shareStore.delete(token);
    });

    sessionStore.cleanup();

    for (const [token, job] of streamStore) {
      if (job.endedAt) {
        if (now - job.endedAt > STREAM_MEM_TTL) streamStore.delete(token);
        continue;
      }

      const lastPing = job.lastHeartbeat || job.startedAt;
      if (now - lastPing > HEARTBEAT_TTL) {
        console.log(`[gc] stale stream ${token} — brak pingu od ${Math.round((now - lastPing) / 1000)}s, ubijam`);
        await go2rtc.deleteStream(token);
        job.endedAt = now;
      }
    }
  }, 15 * 1000);
}

module.exports = startCleanupJob;
