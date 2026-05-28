'use strict';
const { Router } = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cfg = require('../config');
const streamStore = require('../services/streamStore');
const { genToken } = require('../utils/tokens');
const { toRtspTime } = require('../utils/dahua');
const { fileSize, sleep, waitForFileBytes } = require('../utils/files');

const router = Router();

router.post('/start', (req, res) => {
  const { channel, startTime, endTime, filePath } = req.body;

  let inputArgs, logDesc;
  if (channel && startTime && endTime) {
    // RTSP cam/playback: NVR dekoduje DHAV po swojej stronie — omija data partitioning
    const st = toRtspTime(startTime);
    const et = toRtspTime(endTime);
    const inputUrl = `rtsp://${cfg.nvrUser}:${encodeURIComponent(cfg.nvrPass)}@${cfg.nvrHost}:${cfg.rtspPort}/cam/playback?channel=${channel}&starttime=${st}&endtime=${et}`;
    inputArgs = ['-fflags', '+genpts', '-rtsp_transport', 'tcp', '-i', inputUrl];
    logDesc = `ch${channel} ${st}→${et}`;
  } else if (filePath) {
    // Fallback gdy brak czasu — surowy DHAV przez HTTP proxy
    const safePath = filePath.replace(/\.\./g, '');
    const inputUrl = `http://127.0.0.1:${cfg.port}/nvr-proxy/cgi-bin/RPC_Loadfile${safePath}`;
    inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err', '-f', 'dhav', '-i', inputUrl];
    logDesc = safePath;
  } else {
    return res.status(400).json({ success: false, error: 'Brak parametrów' });
  }

  const token = genToken(16);
  const outFile = path.join(cfg.tmpDir, `${token}.mp4`);

  console.log(`[stream:${token}] start → ${logDesc}`);

  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    ...inputArgs,
    '-vf', 'scale=1280:-2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '18',
    '-profile:v', 'baseline', '-level', '4.1',
    '-avoid_negative_ts', 'make_zero',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '1000000',
    '-f', 'mp4', outFile,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const job = { ff, outFile, startedAt: Date.now(), endedAt: null, logDesc };
  streamStore.set(token, job);

  ff.stderr.on('data', d => process.stdout.write(`[ffmpeg:${token}] ${d}`));
  ff.on('error', err => console.error(`[stream:${token}] spawn error:`, err.message));
  ff.on('close', (code) => {
    job.endedAt = Date.now();
    console.log(`[stream:${token}] FFmpeg zakończył (kod: ${code})`);
  });

  res.json({ success: true, token, streamUrl: `/api/stream/video?token=${token}`, mediaType: 'video/mp4' });
});

router.get('/video', async (req, res) => {
  const { token } = req.query;
  const job = streamStore.get(token);
  if (!job) return res.status(404).json({ error: 'Nieznany token strumienia' });

  const PREBUFFER = 5 * 1024 * 1024; // ~15-20s przy 2.5Mbit/s
  const ready = await waitForFileBytes(job.outFile, PREBUFFER, 60000);
  if (!ready && !fs.existsSync(job.outFile)) {
    return res.status(503).json({ error: 'FFmpeg nie zdążył przygotować danych' });
  }

  res.writeHead(200, {
    'Content-Type':  'video/mp4',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'none',
  });

  let pos = 0;
  let closed = false;
  req.on('close', () => { closed = true; });

  while (!closed) {
    const size = fileSize(job.outFile);
    if (size > pos) {
      await new Promise(resolve => {
        const rs = fs.createReadStream(job.outFile, { start: pos, end: size - 1 });
        rs.pipe(res, { end: false });
        rs.on('end', resolve);
        rs.on('error', resolve);
      });
      pos = size;
    } else {
      if (job.endedAt !== null) break;
      await sleep(150);
    }
  }

  if (!res.writableEnded) res.end();
  console.log(`[stream:${token}] Klient odłączył się (pos=${pos})`);
});

router.post('/stop', (req, res) => {
  const { token } = req.body;
  const job = streamStore.get(token);
  if (job && job.endedAt === null) {
    job.ff.kill('SIGTERM');
    console.log(`[stream:${token}] stop requested`);
  }
  res.json({ success: true });
});

module.exports = router;
