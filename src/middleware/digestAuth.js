'use strict';
const crypto = require('crypto');

function addDigestAuth(inst, user, pass) {
  inst.interceptors.response.use(null, async (error) => {
    const cfg = error.config;
    if (error.response?.status !== 401 || cfg._digestRetry) return Promise.reject(error);

    const wwwAuth = error.response.headers['www-authenticate'] || '';
    if (!/digest/i.test(wwwAuth)) return Promise.reject(error);

    const p      = (k) => wwwAuth.match(new RegExp(`${k}="([^"]+)"`))?.[1] || '';
    const realm  = p('realm');
    const nonce  = p('nonce');
    const opaque = p('opaque');
    const qop    = wwwAuth.match(/qop="?([^",\s]+)/)?.[1] || '';

    const ha1    = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
    const absUrl = cfg.url?.startsWith('http') ? cfg.url : (cfg.baseURL || '') + (cfg.url || '');
    const uri    = absUrl.replace(/^https?:\/\/[^/?#]+/, '') || '/';
    const ha2    = crypto.createHash('md5').update(`${(cfg.method || 'GET').toUpperCase()}:${uri}`).digest('hex');

    const nc     = '00000001';
    const cnonce = crypto.randomBytes(4).toString('hex');
    const resp   = qop
      ? crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
      : crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

    const authParts = [
      `Digest username="${user}"`, `realm="${realm}"`, `nonce="${nonce}"`,
      `uri="${uri}"`, `algorithm=MD5`,
      ...(qop    ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
      `response="${resp}"`,
      ...(opaque ? [`opaque="${opaque}"`]                          : []),
    ];

    cfg._digestRetry = true;
    cfg.headers = { ...cfg.headers, Authorization: authParts.join(', ') };
    if (error.response?.data?.resume) error.response.data.resume();
    return inst(cfg);
  });
}

module.exports = addDigestAuth;
