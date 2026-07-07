'use strict';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Rejects state-changing requests that the browser marked as cross-site
// (Fetch Metadata) or whose Origin doesn't match the app's own host.
// Complements sameSite=lax on the session cookie — same protection goal
// without maintaining a separate CSRF token.
module.exports = function csrfGuard(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const site = req.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return res.status(403).json({ error: 'Cross-site request zablokowany' });
  }

  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).json({ error: 'Cross-site request zablokowany' });
  }

  next();
};
