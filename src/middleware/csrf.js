'use strict';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Odrzuca żądania zmieniające stan, które przeglądarka oznaczyła jako
// cross-site (Fetch Metadata) albo których Origin nie zgadza się z hostem
// aplikacji. Uzupełnia sameSite=lax na ciasteczku sesji — ten sam mechanizm
// bez potrzeby trzymania osobnego tokena CSRF.
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
