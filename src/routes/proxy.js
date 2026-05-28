'use strict';
const { Router } = require('express');
const dApi = require('../services/dahuaApi');

const router = Router();

router.use('/', async (req, res) => {
  const nvrPath = req.url;
  try {
    const nvrResp = await dApi.get(nvrPath, { responseType: 'stream', timeout: 0 });
    if (nvrResp.headers['content-type'])   res.setHeader('Content-Type', nvrResp.headers['content-type']);
    if (nvrResp.headers['content-length']) res.setHeader('Content-Length', nvrResp.headers['content-length']);
    nvrResp.data.pipe(res);
    req.on('close', () => nvrResp.data?.destroy?.());
  } catch (e) {
    console.error('[nvr-proxy]', e.message);
    if (!res.headersSent) res.status(502).end();
  }
});

module.exports = router;
