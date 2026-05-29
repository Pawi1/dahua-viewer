'use strict';
const { Router } = require('express');
const cfg        = require('../config');
const sessions   = require('../services/sessionStore');
const shareStore = require('../services/shareStore');

const router = Router();
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' };
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8h

router.get('/check', (req, res) => {
  const session = sessions.get(req.cookies?.vp_session);
  res.json(session ? { authenticated: true, type: session.type } : { authenticated: false });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === cfg.nvrUser && password === cfg.nvrPass) {
    const id = sessions.create('full', SESSION_TTL);
    res.cookie('vp_session', id, { ...COOKIE_OPTS, maxAge: SESSION_TTL });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Nieprawidłowe dane logowania' });
  }
});

// Public — validates share token, creates a limited session (no search access)
router.post('/share', (req, res) => {
  const token = req.query.token || req.body?.token;
  const link  = token ? shareStore.get(token) : null;
  if (!link || Date.now() > link.expiresAt) {
    return res.status(410).json({ success: false, error: 'Link wygasł' });
  }
  const id = sessions.create('share', link.expiresAt - Date.now());
  res.cookie('vp_session', id, { ...COOKIE_OPTS, expires: new Date(link.expiresAt) });
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  sessions.del(req.cookies?.vp_session);
  res.clearCookie('vp_session');
  res.json({ success: true });
});

module.exports = router;
