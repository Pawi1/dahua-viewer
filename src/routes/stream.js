'use strict';
const { Router } = require('express');
const express = require('express');
const cfg = require('../config');
const streamStore = require('../services/streamStore');
const go2rtc = require('../services/go2rtcApi');
const { genToken } = require('../utils/tokens');
const { toRtspTime } = require('../utils/dahua');

const router = Router();

router.post('/start', async (req, res) => {
  const { channel, startTime, endTime, filePath } = req.body;

  let rtspUrl, logDesc;
  if (channel && startTime && endTime) {
    const st = toRtspTime(startTime);
    const et = toRtspTime(endTime);
    rtspUrl = `rtsp://${cfg.nvrUser}:${encodeURIComponent(cfg.nvrPass)}@${cfg.nvrHost}:${cfg.rtspPort}/cam/playback?channel=${channel}&starttime=${st}&endtime=${et}`;
    logDesc = `ch${channel} ${st}→${et}`;
  } else if (filePath) {
    const safePath = filePath.replace(/\.\./g, '');
    rtspUrl = `http://${cfg.nvrUser}:${encodeURIComponent(cfg.nvrPass)}@${cfg.nvrHost}:${cfg.nvrPort}/cgi-bin/RPC_Loadfile${safePath}`;
    logDesc = safePath;
  } else {
    return res.status(400).json({ success: false, error: 'Brak parametrów' });
  }

  const token = genToken(16);
  console.log(`[stream:${token}] start → ${logDesc}`);

  try {
    await go2rtc.createStream(token, `ffmpeg:${rtspUrl}#video=h264#width=1280#height=720`);
    streamStore.set(token, { rtspUrl, startedAt: Date.now(), endedAt: null, logDesc });
    res.json({ success: true, token });
  } catch (err) {
    console.error(`[stream:${token}] go2rtc error:`, err.message);
    res.status(500).json({ success: false, error: 'Nie można uruchomić strumienia' });
  }
});

// WebRTC SDP offer proxy → go2rtc
router.post('/offer', express.text({ type: '*/*' }), async (req, res) => {
  const { token } = req.query;
  if (!streamStore.get(token)) return res.status(404).send('Nieznany token');

  try {
    const answer = await go2rtc.webrtcOffer(token, req.body);
    res.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    res.send(answer);
  } catch (err) {
    console.error(`[stream] WebRTC offer error:`, err.message);
    res.status(500).send('Błąd WebRTC');
  }
});

router.post('/stop', async (req, res) => {
  const { token } = req.body;
  const job = streamStore.get(token);
  if (job) {
    await go2rtc.deleteStream(token);
    job.endedAt = Date.now();
    console.log(`[stream:${token}] stop`);
  }
  res.json({ success: true });
});

module.exports = router;
