'use strict';
const fs = require('fs');
const cfg = require('../config');

fs.mkdirSync(cfg.tmpDir, { recursive: true });

// token → { ff, outFile, startedAt, endedAt, logDesc }
const store = new Map();

module.exports = store;
