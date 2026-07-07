'use strict';
const sessions = require('../services/sessionStore');

const PUBLIC = ['/api/auth/', '/api/config'];

// Share sessions may only touch these prefixes — no search
const SHARE_ALLOWED_PREFIXES = ['/api/stream/', '/api/download', '/api/nvr/'];

// Endpoints where the request params must fall within the scope granted to the share link
const SHARE_SCOPED_PREFIXES = ['/api/stream/start', '/api/download'];

function withinShareScope(scope, req) {
  if (!scope) return false;
  const src     = req.method === 'GET' ? req.query : (req.body || {});
  const channel = parseInt(src.channel, 10);

  if (scope.filePath) return src.filePath === scope.filePath;
  if (channel !== parseInt(scope.channel, 10)) return false;
  if (src.startTime && src.startTime < scope.startTime) return false;
  if (src.endTime   && src.endTime   > scope.endTime)   return false;
  return true;
}

module.exports = function authMiddleware(req, res, next) {
  if (PUBLIC.some(p => req.path.startsWith(p))) return next();

  const session = sessions.get(req.cookies?.session_id);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  if (session.type === 'share') {
    const allowed = SHARE_ALLOWED_PREFIXES.some(p => req.path.startsWith(p));
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const needsScopeCheck = SHARE_SCOPED_PREFIXES.some(p => req.path.startsWith(p));
    if (needsScopeCheck && !withinShareScope(session.scope, req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  req.session = session;
  next();
};
