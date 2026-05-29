'use strict';
const sessions = require('../services/sessionStore');

const PUBLIC = ['/api/auth/', '/api/config'];

module.exports = function authMiddleware(req, res, next) {
  if (PUBLIC.some(p => req.path.startsWith(p))) return next();

  const session = sessions.get(req.cookies?.vp_session);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  // Share-sesje nie mają dostępu do wyszukiwania
  if (session.type === 'share' && req.path.startsWith('/api/search')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.session = session;
  next();
};
