'use strict';
const crypto = require('crypto');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Rejects state-changing requests that the browser marked as cross-site
// (Fetch Metadata) or whose Origin doesn't match the app's own host, and
// enforces a double-submit CSRF token: same-origin JS is the only thing
// that can read the csrfToken cookie and echo it back as a header, so a
// cross-site form/fetch riding on the session cookie alone cannot forge it.
module.exports = function csrfGuard(req, res, next) {
  if (!req.cookies?.csrfToken) {
    const token = crypto.randomBytes(20).toString('hex');
    res.cookie('csrfToken', token, { httpOnly: false, secure: req.secure, sameSite: 'lax' });
    req.cookies = { ...req.cookies, csrfToken: token };
  }

  if (!UNSAFE_METHODS.has(req.method)) return next();

  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Cross-site request zablokowany' });
  }

  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).json({ error: 'Cross-site request zablokowany' });
  }

  const headerToken = req.get('x-csrf-token');
  if (!headerToken || headerToken !== req.cookies.csrfToken) {
    return res.status(403).json({ error: 'Nieprawidłowy token CSRF' });
  }

  next();
};
