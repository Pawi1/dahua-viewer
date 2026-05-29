'use strict';

const express = require('express');
const path    = require('path');
const { spawn, execSync } = require('child_process');

const cfg      = require('./src/config');
const search   = require('./src/routes/search');
const stream   = require('./src/routes/stream');
const download = require('./src/routes/download');
const nvr      = require('./src/routes/nvr');
const proxy    = require('./src/routes/proxy');
const { apiRouter: shareApi, pageRouter: sharePage } = require('./src/routes/share');
const startCleanupJob = require('./src/jobs/cleanup');

// Uruchom go2rtc jako subprocess
function startGo2rtc() {
  const candidates = [process.env.GO2RTC_BIN, '/usr/local/bin/go2rtc', '/usr/bin/go2rtc', '/bin/go2rtc'].filter(Boolean);
  const bin = candidates.find(p => { try { execSync(`test -x ${p}`); return true; } catch { return false; } })
           || 'go2rtc';
  const cfgMain    = path.join(__dirname, 'go2rtc.yaml');
  const cfgStreams  = path.join(__dirname, 'go2rtc-streams.yaml');
  const proc = spawn(bin, ['-config', cfgMain, '-config', cfgStreams], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => process.stdout.write(`[go2rtc] ${d}`));
  proc.stderr.on('data', d => process.stdout.write(`[go2rtc] ${d}`));
  proc.on('close', code => console.log(`[go2rtc] zakończył (kod: ${code})`));
  proc.on('error', err  => console.error(`[go2rtc] błąd startu:`, err.message));
  return proc;
}
startGo2rtc();

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
