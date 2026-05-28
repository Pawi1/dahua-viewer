'use strict';
const { Router } = require('express');
const dApi = require('../services/dahuaApi');
const { parseKeyValue, parseMediaFiles } = require('../utils/dahua');

const router = Router();

router.post('/', async (req, res) => {
  const { channel, startTime, endTime, types } = req.body;
  const channelNum = parseInt(channel, 10);

  if (!channelNum || !startTime || !endTime) {
    return res.status(400).json({ error: 'Brak wymaganych parametrów: channel, startTime, endTime' });
  }

  let objectId = null;
  try {
    const createResp = await dApi.get('/cgi-bin/mediaFileFind.cgi?action=factory.create');
    objectId = parseKeyValue(createResp.data).result;
    if (!objectId) throw new Error('Nie można utworzyć obiektu wyszukiwania (brak result)');

    const searchTypes = types || ['dav', 'mp4'];
    const typeParams = searchTypes.map((t, i) => `condition.Types[${i}]=${t}`).join('&');
    const query = [
      'action=findFile',
      `object=${objectId}`,
      `condition.Channel=${channelNum}`,
      `condition.StartTime=${startTime.replace(/ /g, '%20')}`,
      `condition.EndTime=${endTime.replace(/ /g, '%20')}`,
      typeParams,
    ].join('&');

    await dApi.get(`/cgi-bin/mediaFileFind.cgi?${query}`);

    const PAGE = 100;
    let allFiles = [];
    let totalFound = 0;
    while (true) {
      const findResp = await dApi.get(
        `/cgi-bin/mediaFileFind.cgi?action=findNextFile&object=${objectId}&count=${PAGE}`
      );
      const parsed = parseMediaFiles(findResp.data);
      const offset = allFiles.length;
      parsed.files.forEach((f) => { f.id = offset + f.id; });
      totalFound += parsed.found;
      allFiles = allFiles.concat(parsed.files);
      if (parsed.found < PAGE) break;
    }

    res.json({ success: true, found: totalFound, files: allFiles });
  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (objectId) {
      try {
        await dApi.get(`/cgi-bin/mediaFileFind.cgi?action=close&object=${objectId}`);
        await dApi.get(`/cgi-bin/mediaFileFind.cgi?action=destroy&object=${objectId}`);
      } catch (_) {}
    }
  }
});

module.exports = router;
