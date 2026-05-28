'use strict';
const { Router } = require('express');
const path = require('path');
const dApi = require('../services/dahuaApi');

const router = Router();

router.get('/', async (req, res) => {
  const { channel, startTime, endTime, filePath: fp, sample } = req.query;

  let downloadPath, filename;

  if (fp && !sample) {
    const safePath = fp.replace(/\.\./g, '');
    downloadPath = `/cgi-bin/RPC_Loadfile${safePath}`;
    filename     = path.basename(safePath) || 'recording.dav';
  } else {
    const channelNum = parseInt(channel, 10);
    if (!channelNum || !startTime) {
      return res.status(400).json({ error: 'Brak parametrów' });
    }
    const sampleSec = sample ? parseInt(sample, 10) : null;
    let effectiveEnd = endTime;
    if (sampleSec) {
      // Parse "YYYY-MM-DD HH:MM:SS" i dodaj sekundy bez konwersji strefy
      const [datePart, timePart] = startTime.split(' ');
      const [h, m, s] = timePart.split(':').map(Number);
      const total = h * 3600 + m * 60 + s + sampleSec;
      const nh = Math.floor(total / 3600) % 24;
      const nm = Math.floor((total % 3600) / 60);
      const ns = total % 60;
      effectiveEnd = `${datePart} ${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}:${String(ns).padStart(2,'0')}`;
    }
    if (!effectiveEnd) return res.status(400).json({ error: 'Brak endTime' });
    const st = startTime.replace(/ /g, '%20');
    const et = effectiveEnd.replace(/ /g, '%20');
    downloadPath = `/cgi-bin/loadfile.cgi?action=startLoad&channel=${channelNum}&startTime=${st}&endTime=${et}&subtype=0&Types=dav`;
    const suffix = sampleSec ? `_sample${sampleSec}s` : '';
    filename = `nagranie_ch${channel}_${startTime.replace(/[: ]/g, '-')}${suffix}.dav`;
  }

  try {
    const response = await dApi({ method: 'get', url: downloadPath, responseType: 'stream', timeout: 0 });
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
    response.data.pipe(res);
    response.data.on('error', (err) => console.error('[download] Stream error:', err.message));
  } catch (err) {
    console.error('[download]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
