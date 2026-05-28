'use strict';

const express = require('express');
const path    = require('path');

const cfg      = require('./src/config');
const search   = require('./src/routes/search');
const stream   = require('./src/routes/stream');
const download = require('./src/routes/download');
const nvr      = require('./src/routes/nvr');
const proxy    = require('./src/routes/proxy');
const { apiRouter: shareApi, pageRouter: sharePage } = require('./src/routes/share');
const startCleanupJob = require('./src/jobs/cleanup');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/search',   search);
app.use('/api/stream',   stream);
app.use('/api/download', download);
app.use('/api/nvr',      nvr);
app.use('/api/share',    shareApi);
app.use('/share',        sharePage);
app.use('/nvr-proxy',    proxy);

startCleanupJob();

app.listen(cfg.port, () => {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         Dahua NVR Web Viewer — uruchomiony        ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  Adres:       http://localhost:${cfg.port}               ║`);
  console.log(`║  NVR:         ${cfg.nvrHost}:${cfg.nvrPort}                     ║`);
  console.log(`║  Użytkownik:  ${cfg.nvrUser}                           ║`);
  console.log(`║  Kanały:      ${cfg.channels}                               ║`);
  console.log('╚═══════════════════════════════════════════════════╝');
});
