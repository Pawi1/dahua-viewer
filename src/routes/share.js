'use strict';
const { Router } = require('express');
const cfg      = require('../config');
const shareStore  = require('../services/shareStore');
const sessions    = require('../services/sessionStore');
const { genToken } = require('../utils/tokens');

const EXPIRED_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link wygasł</title>
  <style>
    body { font-family: monospace; background:#0a0a0f; color:#ff4444;
           display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .box { text-align:center; }
    h1 { font-size:4rem; margin:0; }
    p  { color:#666; margin-top:1rem; }
  </style>
</head>
<body>
  <div class="box"><h1>410</h1><p>Ten link wygasł lub jest nieprawidłowy.</p></div>
</body>
</html>`;

const apiRouter = Router();

apiRouter.post('/', (req, res) => {
  const { channel, startTime, endTime, filePath, ttlHours } = req.body;
  if (!channel || !startTime || !endTime) {
    return res.status(400).json({ error: 'Brak wymaganych danych' });
  }

  const token     = genToken(20);
  const ttl       = Math.min(parseInt(ttlHours || cfg.shareTtlH), 720);
  const expiresAt = Date.now() + ttl * 3600 * 1000;

  shareStore.set(token, { channel, startTime, endTime, filePath, expiresAt, ttl });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    success:   true,
    token,
    url:       `${baseUrl}/share/${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlHours:  ttl,
  });
});

apiRouter.get('/:token', (req, res) => {
  const link = shareStore.get(req.params.token);
  if (!link || Date.now() > link.expiresAt) {
    return res.status(410).json({ error: 'Link wygasł' });
  }
  res.json({ ...link, expiresAt: new Date(link.expiresAt).toISOString() });
});

const pageRouter = Router();

pageRouter.get('/:token', (req, res) => {
  const link = shareStore.get(req.params.token);
  if (!link || Date.now() > link.expiresAt) {
    return res.status(410).send(EXPIRED_HTML);
  }
  const { channel, startTime, endTime, filePath } = link;

  const sessionId = sessions.create('share', link.expiresAt - Date.now(), { channel, startTime, endTime, filePath });
  res.cookie('vp_session', sessionId, { httpOnly: true, sameSite: 'lax', expires: new Date(link.expiresAt) });

  const params = new URLSearchParams({ mode: 'share', token: req.params.token, ch: channel, start: startTime, end: endTime, autoplay: '1' });
  if (filePath) params.set('fp', filePath);
  res.redirect(`/?${params.toString()}`);
});

module.exports = { apiRouter, pageRouter };
