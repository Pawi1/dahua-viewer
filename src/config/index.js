'use strict';
const crypto = require('crypto');

module.exports = {
  nvrHost:   process.env.NVR_HOST      || '192.168.1.108',
  nvrPort:   process.env.NVR_PORT      || '80',
  nvrUser:   process.env.NVR_USER      || 'admin',
  nvrPass:   process.env.NVR_PASS      || 'admin',
  rtspPort:  process.env.NVR_RTSP_PORT || '554',
  channels:  parseInt(process.env.NVR_CHANNELS || '16'),
  port:      parseInt(process.env.PORT          || '3000'),
  shareTtlH: parseInt(process.env.SHARE_TTL_H  || '72'),
  secretKey: process.env.SECRET_KEY   || crypto.randomBytes(32).toString('hex'),
  tmpDir:    process.env.OUT_DIR       || '/tmp/dahua_viewer',
  debug:     ['true','1','yes'].includes((process.env.DEBUG || '').toLowerCase()),
};
