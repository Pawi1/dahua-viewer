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
  if (filePath) {
    const safePath = filePath.replace(/\.\./g, '');
    const inputUrl = `http://127.0.0.1:${cfg.port}/nvr-proxy/cgi-bin/RPC_Loadfile${safePath}`;
    inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err', '-f', 'dhav', '-i', inputUrl];
    logDesc = safePath;
  } else if (channel && startTime && endTime) {
    const st = toRtspTime(startTime);
    const et = toRtspTime(endTime);
    const inputUrl = `rtsp://${cfg.nvrUser}:${encodeURIComponent(cfg.nvrPass)}@${cfg.nvrHost}:${cfg.rtspPort}/cam/playback?channel=${channel}&starttime=${st}&endtime=${et}`;
    inputArgs = ['-fflags', '+genpts', '-rtsp_transport', 'tcp', '-i', inputUrl];
    logDesc = `ch${channel} ${st}→${et}`;
  } else {
    return res.status(400).json({ success: false, error: 'Brak parametrów' });
  }

  const token = genToken(16);
  const outFile = path.join(cfg.tmpDir, `${token}.mp4`);

  console.log(`[stream:${token}] start → ${logDesc}`);

  // Dahua DHAV files use H.264 data partitioning (NAL 2/3/4) which FFmpeg copy mode
  // cannot pass through cleanly. Transcode to standard H.264 so error concealment applies.
  const videoCodec = filePath
    ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '50', '-sc_threshold', '0']
    : ['-c:v', 'copy'];

  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'info',
    ...inputArgs,
    ...videoCodec,
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

  const PREBUFFER = 256 * 1024;
  const ready = await waitForFileBytes(job.outFile, PREBUFFER, 25000);
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
        rs.on('data', chunk => { if (!res.write(chunk)) rs.pause(); });
        res.on('drain', () => rs.resume());
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
