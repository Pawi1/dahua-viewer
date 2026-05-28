'use strict';
const { Router } = require('express');
const path = require('path');
const dApi = require('../services/dahuaApi');

const router = Router();

router.get('/', async (req, res) => {
  const { channel, startTime, endTime, filePath: fp } = req.query;

  let downloadPath, filename;

  if (fp) {
    const safePath = fp.replace(/\.\./g, '');
    downloadPath = `/cgi-bin/RPC_Loadfile${safePath}`;
    filename     = path.basename(safePath) || 'recording.dav';
  } else {
    const channelNum = parseInt(channel, 10);
    if (!channelNum || !startTime || !endTime) {
      return res.status(400).json({ error: 'Brak parametrów' });
    }
    const st = startTime.replace(/ /g, '%20');
    const et = endTime.replace(/ /g, '%20');
    downloadPath = `/cgi-bin/loadfile.cgi?action=startLoad&channel=${channelNum}&startTime=${st}&endTime=${et}&subtype=0&Types=dav`;
    filename     = `nagranie_ch${channel}_${startTime.replace(/[: ]/g, '-')}.dav`;
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
