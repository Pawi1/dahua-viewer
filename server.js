'use strict';

const express      = require('express');
const helmet       = require('helmet');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');
const { spawn, execSync } = require('child_process');

const cfg      = require('./src/config');
const auth     = require('./src/routes/auth');
const search   = require('./src/routes/search');
const stream   = require('./src/routes/stream');
const download = require('./src/routes/download');
const nvr      = require('./src/routes/nvr');
const { apiRouter: shareApi, pageRouter: sharePage } = require('./src/routes/share');
const startCleanupJob = require('./src/jobs/cleanup');
const authMiddleware  = require('./src/middleware/auth');
const csrfGuard       = require('./src/middleware/csrf');

function startGo2rtc() {
  const candidates = [process.env.GO2RTC_BIN, '/usr/local/bin/go2rtc', '/usr/bin/go2rtc', '/bin/go2rtc'].filter(Boolean);
  const bin = candidates.find(p => { try { execSync(`test -x ${p}`); return true; } catch { return false; } })
           || 'go2rtc';
  const cfgStreams = path.join(__dirname, 'go2rtc-streams.yaml');
  const staticCfg  = fs.readFileSync(path.join(__dirname, 'go2rtc.yaml'), 'utf8')
                       .replace(/^streams:[\s\S]*/m, '').trimEnd();
  fs.writeFileSync(cfgStreams, `${staticCfg}\nstreams:\n`);

  const proc = spawn(bin, ['-config', cfgStreams], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => process.stdout.write(`[go2rtc] ${d}`));
  proc.stderr.on('data', d => process.stdout.write(`[go2rtc] ${d}`));
  proc.on('close', code => console.log(`[go2rtc] zakończył (kod: ${code})`));
  proc.on('error', err  => console.error(`[go2rtc] błąd startu:`, err.message));
  return proc;
}
startGo2rtc();

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(csrfGuard);
// CSP wyłączone: UI opiera się na atrybutach onclick="..." i module scriptcie
// inline w converter.html — dopasowanie CSP do tego wymagałoby osobnego
// refaktoru frontendu. Reszta nagłówków helmeta (HSTS, X-Frame-Options,
// nosniff, referrer-policy...) działa bez zmian w UI.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/ffmpeg/ffmpeg', express.static(path.join(__dirname, 'node_modules/@ffmpeg/ffmpeg/dist/esm')));
app.use('/ffmpeg/core',   express.static(path.join(__dirname, 'node_modules/@ffmpeg/core/dist/esm')));
app.use('/ffmpeg/util',   express.static(path.join(__dirname, 'node_modules/@ffmpeg/util/dist/esm')));

app.get('/api/config', (_req, res) => res.json({ debug: cfg.debug }));
app.use('/api/auth', auth);
app.use('/share',    sharePage);

app.use(authMiddleware);
app.use('/api/search',   search);
app.use('/api/stream',   stream);
app.use('/api/download', download);
app.use('/api/nvr',      nvr);
app.use('/api/share',    shareApi);

startCleanupJob();

app.listen(cfg.port, () => {
  console.log(`Dahua NVR Web Viewer → http://localhost:${cfg.port}  |  NVR: ${cfg.nvrHost}:${cfg.nvrPort}  |  user: ${cfg.nvrUser}  |  kanały: ${cfg.channels}`);
});
