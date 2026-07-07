'use strict';
const { Router } = require('express');
const crypto     = require('crypto');
const cfg        = require('../config');
const sessions   = require('../services/sessionStore');
const shareStore = require('../services/shareStore');

const router = Router();
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' };
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8h

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.get('/check', (req, res) => {
  const session = sessions.get(req.cookies?.session_id);
  res.json(session ? { authenticated: true, type: session.type } : { authenticated: false });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (safeEqual(username, cfg.nvrUser) && safeEqual(password, cfg.nvrPass)) {
    const id = sessions.create('full', SESSION_TTL);
    res.cookie('session_id', id, { ...COOKIE_OPTS, maxAge: SESSION_TTL });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Nieprawidłowe dane logowania' });
  }
});

// Public — validates share token, creates a limited session (no search access)
router.post('/share', (req, res) => {
  const token = req.query.token || req.body?.token;
  const link  = shareStore.getValid(token);
  if (!link) return res.status(410).json({ success: false, error: 'Link wygasł' });
  const id = sessions.create('share', link.expiresAt - Date.now(), {
    channel: link.channel, startTime: link.startTime, endTime: link.endTime, filePath: link.filePath,
  });
  res.cookie('session_id', id, { ...COOKIE_OPTS, expires: new Date(link.expiresAt) });
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  sessions.del(req.cookies?.session_id);
  res.clearCookie('session_id');
  res.json({ success: true });
});

module.exports = router;
