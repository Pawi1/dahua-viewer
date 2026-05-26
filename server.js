/**
 * Dahua NVR Web Viewer — server.js
 *
 * Wymagania:
 *   - Node.js >= 16
 *   - ffmpeg zainstalowany w systemie (sudo apt install ffmpeg)
 *   - npm install
 *
 * Uruchomienie:
 *   NVR_HOST=192.168.1.108 NVR_USER=admin NVR_PASS=twoje_haslo node server.js
 *
 * Zmienne środowiskowe:
 *   NVR_HOST      - IP lub hostname rejestratora (domyślnie: 192.168.1.108)
 *   NVR_PORT      - Port HTTP rejestratora       (domyślnie: 80)
 *   NVR_USER      - Użytkownik                   (domyślnie: admin)
 *   NVR_PASS      - Hasło                        (domyślnie: admin)
 *   NVR_RTSP_PORT - Port RTSP                    (domyślnie: 554)
 *   NVR_CHANNELS  - Liczba kanałów               (domyślnie: 16)
 *   PORT          - Port serwera webowego        (domyślnie: 3000)
 *   SHARE_TTL_H   - Czas życia linku share [h]  (domyślnie: 72)
 *   SECRET_KEY    - Klucz do podpisywania tokenów (wygeneruj losowy!)
 */

'use strict';

const express    = require('express');
const axios      = require('axios');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');

// ─── KONFIGURACJA ────────────────────────────────────────────────────────────
const CFG = {
  nvrHost:     process.env.NVR_HOST     || '192.168.1.108',
  nvrPort:     process.env.NVR_PORT     || '80',
  nvrUser:     process.env.NVR_USER     || 'admin',
  nvrPass:     process.env.NVR_PASS     || 'admin',
  rtspPort:    process.env.NVR_RTSP_PORT|| '554',
  channels:    parseInt(process.env.NVR_CHANNELS || '16'),
  port:        parseInt(process.env.PORT || '3000'),
  shareTtlH:   parseInt(process.env.SHARE_TTL_H || '72'),
  secretKey:   process.env.SECRET_KEY   || crypto.randomBytes(32).toString('hex'),
};

// ─── SETUP ────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Axios instance do Dahua (Digest Auth)
const dApi = axios.create({
  baseURL: `http://${CFG.nvrHost}:${CFG.nvrPort}`,
  timeout: 15000,
  transformResponse: [(data) => data]
});

// Digest Auth interceptor (RFC 7616 MD5) — axios auth: obsługuje tylko Basic Auth
(function addDigestAuth(inst, user, pass) {
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
      ...(opaque ? [`opaque="${opaque}"`] : [])
    ];

    cfg._digestRetry = true;
    cfg.headers = { ...cfg.headers, Authorization: authParts.join(', ') };
    if (error.response?.data?.resume) error.response.data.resume();
    return inst(cfg);
  });
})(dApi, CFG.nvrUser, CFG.nvrPass);

// In-memory store
const sharedLinks = new Map();   // token → { channel, startTime, endTime, expiresAt }

// ─── UTILS ────────────────────────────────────────────────────────────────────
function parseKeyValue(text) {
  const result = {};
  const lines = text.split('\n');
  lines.forEach(line => {
    const idx = line.indexOf('=');
    if (idx > -1) {
      result[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
  return result;
}

function parseMediaFiles(text) {
  const found = parseInt(text.match(/found=(\d+)/)?.[1] || '0');
  const files = [];
  for (let i = 0; i < found; i++) {
    const get = (key) => text.match(new RegExp(`items\\[${i}\\]\\.${key}=([^\r\n]+)`))?.[1]?.trim() || '';
    const events = [];
    let ei = 0;
    while (true) {
      const ev = text.match(new RegExp(`items\\[${i}\\]\\.Events\\[${ei}\\]=([^\r\n]+)`))?.[1]?.trim();
      if (!ev) break;
      events.push(ev); ei++;
    }
    files.push({
      id:         i,
      startTime:  get('StartTime'),
      endTime:    get('EndTime'),
      filePath:   get('FilePath'),
      type:       get('Type') || 'dav',
      duration:   parseInt(get('Duration') || '0'),
      length:     parseInt(get('Length') || '0'),
      channel:    parseInt(get('Channel') || '0'),
      events
    });
  }
  return { found, files };
}

// Formatuje timestamp Dahua → RTSP format: 2025_01_15_08_00_00
function toRtspTime(str) {
  return str.replace(/-/g,'_').replace(/ /g,'_').replace(/:/g,'_');
}

// Generuje unikalny token
function genToken(len = 24) {
  return crypto.randomBytes(len).toString('hex');
}

// ─── API: WYSZUKIWANIE NAGRAŃ ─────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  const { channel, startTime, endTime, types } = req.body;
  const channelNum = parseInt(channel, 10);

  if (!channelNum || !startTime || !endTime) {
    return res.status(400).json({ error: 'Brak wymaganych parametrów: channel, startTime, endTime' });
  }

  let objectId = null;
  try {
    const createResp = await dApi.get('/cgi-bin/mediaFileFind.cgi?action=factory.create');
    objectId = parseKeyValue(createResp.data).result;
    if (!objectId) throw new Error('Nie można utworzyć obiektu wyszukiwania (brak result)');

    const searchTypes = types || ['dav', 'mp4'];
    let typeParams = searchTypes.map((t, i) => `condition.Types[${i}]=${t}`).join('&');
    const query = [
      `action=findFile`,
      `object=${objectId}`,
      `condition.Channel=${channelNum}`,
      `condition.StartTime=${startTime.replace(/ /g, '%20')}`,
      `condition.EndTime=${endTime.replace(/ /g, '%20')}`,
      typeParams
    ].join('&');

    await dApi.get(`/cgi-bin/mediaFileFind.cgi?${query}`);

    const PAGE = 100;
    let allFiles = [];
    let totalFound = 0;
    while (true) {
      const findResp = await dApi.get(
        `/cgi-bin/mediaFileFind.cgi?action=findNextFile&object=${objectId}&count=${PAGE}`
      );
      const parsed = parseMediaFiles(findResp.data);
      const offset = allFiles.length;
      parsed.files.forEach((f) => { f.id = offset + f.id; });
      totalFound += parsed.found;
      allFiles = allFiles.concat(parsed.files);
      if (parsed.found < PAGE) break;
    }

    res.json({ success: true, found: totalFound, files: allFiles });

  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (objectId) {
      try {
        await dApi.get(`/cgi-bin/mediaFileFind.cgi?action=close&object=${objectId}`);
        await dApi.get(`/cgi-bin/mediaFileFind.cgi?action=destroy&object=${objectId}`);
      } catch (_) {}
    }
  }
});

// ─── API: START STREAM ────────────────────────────────────────────────────────
// Zwraca URL do /api/stream/video — FFmpeg nie zapisuje plików, streamuje przez pipe
app.post('/api/stream/start', (req, res) => {
  const { channel, startTime, endTime, filePath } = req.body;

  const params = new URLSearchParams();
  if (filePath) {
    params.set('filePath', filePath);
  } else {
    if (!channel || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'Brak parametrów' });
    }
    params.set('channel', channel);
    params.set('startTime', startTime);
    params.set('endTime', endTime);
  }

  const token = genToken();
  res.json({
    success:   true,
    token,
    streamUrl: `/api/stream/video?${params.toString()}`,
    mediaType: 'video/mp4'
  });
});

// ─── STREAM VIDEO ─────────────────────────────────────────────────────────────
// FFmpeg → fragmented MP4 → stdout → HTTP response (brak zapisu do pliku)
app.get('/api/stream/video', (req, res) => {
  const { filePath, channel, startTime, endTime } = req.query;

  let inputArgs, logDesc;
  if (filePath) {
    const safePath = filePath.replace(/\.\./g, '');
    const inputUrl = `http://127.0.0.1:${CFG.port}/nvr-proxy/cgi-bin/RPC_Loadfile${safePath}`;
    inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err', '-f', 'dhav', '-i', inputUrl];
    logDesc = safePath;
  } else if (startTime && endTime && channel) {
    const st = toRtspTime(startTime);
    const et = toRtspTime(endTime);
    const inputUrl = `rtsp://${CFG.nvrUser}:${encodeURIComponent(CFG.nvrPass)}@${CFG.nvrHost}:${CFG.rtspPort}/cam/playback?channel=${channel}&starttime=${st}&endtime=${et}`;
    inputArgs = ['-fflags', '+genpts', '-rtsp_transport', 'tcp', '-i', inputUrl];
    logDesc = `ch${channel} ${st}→${et}`;
  } else {
    return res.status(400).json({ error: 'Brak parametrów' });
  }

  const token = genToken(8);
  console.log(`[stream:${token}] ${logDesc}`);

  const ffmpeg = spawn('ffmpeg', [
    ...inputArgs,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Accept-Ranges', 'none');

  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', d => process.stdout.write(`[ffmpeg:${token}] ${d}`));

  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
    console.log(`[stream:${token}] Klient odłączył się`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`[stream:${token}] FFmpeg zakończył (kod: ${code})`);
    if (!res.writableEnded) res.end();
  });

  ffmpeg.on('error', (err) => {
    console.error(`[stream:${token}] FFmpeg błąd:`, err.message);
    if (!res.headersSent) res.status(500).end();
  });
});

// ─── PROXY: POBIERANIE PLIKU Z NVR (dla FFmpeg — obsługuje Digest Auth) ──────
app.use('/nvr-proxy', async (req, res) => {
  const nvrPath = req.url;
  try {
    const nvrResp = await dApi.get(nvrPath, { responseType: 'stream', timeout: 0 });
    if (nvrResp.headers['content-type'])
      res.setHeader('Content-Type', nvrResp.headers['content-type']);
    if (nvrResp.headers['content-length'])
      res.setHeader('Content-Length', nvrResp.headers['content-length']);
    nvrResp.data.pipe(res);
    req.on('close', () => nvrResp.data?.destroy?.());
  } catch (e) {
    console.error('[nvr-proxy]', e.message);
    if (!res.headersSent) res.status(502).end();
  }
});

// ─── API: STOP STREAM ─────────────────────────────────────────────────────────
// Strumień kończy się automatycznie gdy klient zamknie połączenie z /api/stream/video
app.post('/api/stream/stop', (req, res) => {
  res.json({ success: true });
});

// ─── API: POBIERANIE PLIKU ────────────────────────────────────────────────────
app.get('/api/download', async (req, res) => {
  const { channel, startTime, endTime, filePath: fp } = req.query;

  let downloadPath;
  let filename;

  if (fp) {
    const safePath = fp.replace(/\.\./g, '');
    downloadPath = `/cgi-bin/RPC_Loadfile${safePath}`;
    filename     = path.basename(safePath) || 'recording.dav';
  } else {
    const channelNum = parseInt(channel, 10);
    if (!channelNum || !startTime || !endTime) {
      return res.status(400).json({ error: 'Brak parametrów' });
    }
    const st = startTime.replace(/ /g, '%20');
    const et = endTime.replace(/ /g, '%20');
    downloadPath = `/cgi-bin/loadfile.cgi?action=startLoad&channel=${channelNum}&startTime=${st}&endTime=${et}&subtype=0&Types=dav`;
    filename     = `nagranie_ch${channel}_${startTime.replace(/[: ]/g, '-')}.dav`;
  }

  try {
    const response = await dApi({
      method:       'get',
      url:          downloadPath,
      responseType: 'stream',
      timeout:      0
    });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    response.data.pipe(res);
    response.data.on('error', (err) => {
      console.error('[download] Stream error:', err.message);
    });
  } catch (err) {
    console.error('[download]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─── API: GENEROWANIE LINKU SHARE ─────────────────────────────────────────────
app.post('/api/share', (req, res) => {
  const { channel, startTime, endTime, filePath, ttlHours } = req.body;
  if (!channel || !startTime || !endTime) {
    return res.status(400).json({ error: 'Brak wymaganych danych' });
  }

  const token     = genToken(20);
  const ttl       = Math.min(parseInt(ttlHours || CFG.shareTtlH), 720);
  const expiresAt = Date.now() + ttl * 3600 * 1000;

  sharedLinks.set(token, { channel, startTime, endTime, filePath, expiresAt, ttl });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.json({
    success:   true,
    token,
    url:       `${baseUrl}/share/${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlHours:  ttl
  });
});

// ─── STRONA SHARE ──────────────────────────────────────────────────────────────
app.get('/share/:token', (req, res) => {
  const link = sharedLinks.get(req.params.token);
  if (!link || Date.now() > link.expiresAt) {
    return res.status(410).send(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link wygasł</title>
  <style>
    body { font-family: monospace; background:#0a0a0f; color:#ff4444;
           display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .box { text-align:center; }
    h1 { font-size:4rem; margin:0; }
    p  { color:#666; margin-top:1rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>410</h1>
    <p>Ten link wygasł lub jest nieprawidłowy.</p>
  </div>
</body>
</html>`);
  }
  const { channel, startTime, endTime, filePath } = link;
  const params = new URLSearchParams({ ch: channel, start: startTime, end: endTime, autoplay: '1' });
  if (filePath) params.set('fp', filePath);
  res.redirect(`/?${params.toString()}`);
});

app.get('/api/share/:token', (req, res) => {
  const link = sharedLinks.get(req.params.token);
  if (!link || Date.now() > link.expiresAt) {
    return res.status(410).json({ error: 'Link wygasł' });
  }
  res.json({ ...link, expiresAt: new Date(link.expiresAt).toISOString() });
});

// ─── API: INFO O REJESTRATORZE ────────────────────────────────────────────────
app.get('/api/nvr/info', async (req, res) => {
  try {
    const r = await dApi.get('/cgi-bin/magicBox.cgi?action=getSystemInfo');
    const data = parseKeyValue(r.data);
    res.json({ success: true, info: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/nvr/channels', async (req, res) => {
  try {
    const r = await dApi.get('/cgi-bin/devVideoInput.cgi?action=getCollect');
    const count = parseInt(r.data.match(/count=(\d+)/)?.[1] || CFG.channels);
    res.json({ success: true, count });
  } catch (_) {
    res.json({ success: true, count: CFG.channels });
  }
});

// ─── CZYSZCZENIE ZASOBÓW ───────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  sharedLinks.forEach((link, token) => {
    if (now > link.expiresAt) sharedLinks.delete(token);
  });
}, 5 * 60 * 1000);

// ─── START SERWERA ────────────────────────────────────────────────────────────
app.listen(CFG.port, () => {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║         Dahua NVR Web Viewer — uruchomiony        ║');
  console.log('╠═══════════════════════════════════════════════════╣');
  console.log(`║  Adres:       http://localhost:${CFG.port}               ║`);
  console.log(`║  NVR:         ${CFG.nvrHost}:${CFG.nvrPort}                     ║`);
  console.log(`║  Użytkownik:  ${CFG.nvrUser}                           ║`);
  console.log(`║  Kanały:      ${CFG.channels}                               ║`);
  console.log('╚═══════════════════════════════════════════════════╝');
});
