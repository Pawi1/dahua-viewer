'use strict';
const { Router } = require('express');
const cfg      = require('../config');
const sessions = require('../services/sessionStore');

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

router.post('/logout', (req, res) => {
  sessions.del(req.cookies?.vp_session);
  res.clearCookie('vp_session');
  res.json({ success: true });
});

module.exports = router;
