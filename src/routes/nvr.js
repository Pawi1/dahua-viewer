'use strict';
const { Router } = require('express');
const cfg = require('../config');
const dApi = require('../services/dahuaApi');
const { parseKeyValue } = require('../utils/dahua');

const router = Router();

router.get('/info', async (req, res) => {
  try {
    const r = await dApi.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
    res.json({ success: true, info: parseKeyValue(r.data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/channels', async (req, res) => {
  try {
    const r = await dApi.get('/cgi-bin/devVideoInput.cgi?action=getCollect');
    const count = parseInt(r.data.match(/count=(\d+)/)?.[1] || cfg.channels);
    res.json({ success: true, count });
  } catch (_) {
    res.json({ success: true, count: cfg.channels });
  }
});

module.exports = router;
