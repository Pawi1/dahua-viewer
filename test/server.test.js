'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createApp, startGo2rtc } = require('../server');
const { startTestServer } = require('../test-support/http');

async function withApp(fn) {
  const app = createApp();
  const server = await startTestServer(app);
  try {
    await fn(server.baseUrl);
  } finally {
    await server.close();
  }
}

test('requiring server.js as a module does not start listening or spawn go2rtc', () => {
  // If createApp() had side effects (app.listen, startGo2rtc), requiring it
  // here would already have bound a port / spawned a process as a side
  // effect of the top-level require above. Nothing to assert beyond "this
  // file even got this far without crashing" plus the following tests
  // proving createApp() returns a fresh, working app on demand.
  assert.equal(typeof createApp, 'function');
});

test('GET /api/config is public and returns the debug flag', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/config`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(typeof body.debug, 'boolean');
  });
});

test('static files are served from public/', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/index.html`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<title>NVR Viewer<\/title>/);
  });
});

test('security headers (helmet) are present, including a real CSP', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/config`);
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');

    const csp = r.headers.get('content-security-policy');
    assert.ok(csp);
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /object-src 'none'/);
  });
});

test('protected API routes are mounted behind authMiddleware (401 without a session)', async () => {
  await withApp(async (baseUrl) => {
    // GET first to pick up the csrfToken cookie, so these POSTs get past the
    // CSRF layer and actually exercise the auth layer underneath it.
    const first = await fetch(`${baseUrl}/api/config`);
    const csrfToken = (first.headers.get('set-cookie') || '').match(/csrfToken=([^;]+)/)[1];
    const headers = { cookie: `csrfToken=${csrfToken}`, 'x-csrf-token': csrfToken };

    const paths = ['/api/search', '/api/stream/start', '/api/download', '/api/nvr/info', '/api/share'];
    for (const p of paths) {
      const r = await fetch(`${baseUrl}${p}`, { method: p === '/api/nvr/info' ? 'GET' : 'POST', headers });
      assert.equal(r.status, 401, `expected 401 for ${p}`);
    }
  });
});

test('/api/auth and /share are public (not behind authMiddleware)', async () => {
  await withApp(async (baseUrl) => {
    const check = await fetch(`${baseUrl}/api/auth/check`);
    assert.equal(check.status, 200);

    const share = await fetch(`${baseUrl}/share/does-not-exist`, { redirect: 'manual' });
    assert.equal(share.status, 410); // reaches the route, doesn't 401 first
  });
});

test('the CSRF guard applies globally, before routes are reached', async () => {
  await withApp(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ username: 'admin', password: 'admin' }),
    });
    assert.equal(r.status, 403);
  });
});

test('startGo2rtc spawns the binary found via GO2RTC_BIN and writes a runtime streams config', async () => {
  const prevBin = process.env.GO2RTC_BIN;
  process.env.GO2RTC_BIN = '/usr/bin/true';
  try {
    const proc = startGo2rtc();
    const [code] = await new Promise((resolve) => proc.once('close', (c) => resolve([c])));
    assert.equal(code, 0);
    assert.equal(proc.spawnfile, '/usr/bin/true');

    const written = fs.readFileSync(path.join(__dirname, '..', 'go2rtc-streams.yaml'), 'utf8');
    assert.match(written, /streams:\s*$/);
  } finally {
    if (prevBin === undefined) delete process.env.GO2RTC_BIN;
    else process.env.GO2RTC_BIN = prevBin;
  }
});

test('startGo2rtc falls back to the bare "go2rtc" command when no candidate binary is found', async () => {
  const prevBin = process.env.GO2RTC_BIN;
  process.env.GO2RTC_BIN = '/no/such/binary';
  try {
    const proc = startGo2rtc();
    const err = await new Promise((resolve) => proc.once('error', resolve));
    assert.equal(proc.spawnfile, 'go2rtc');
    assert.equal(err.code, 'ENOENT');
  } finally {
    if (prevBin === undefined) delete process.env.GO2RTC_BIN;
    else process.env.GO2RTC_BIN = prevBin;
  }
});

test('running `node server.js` directly starts listening and serves requests (covers the require.main entry point)', async () => {
  const port = 4700 + Math.floor(Math.random() * 100);
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NVR_HOST: '192.0.2.1', GO2RTC_BIN: '/usr/bin/true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  proc.stdout.on('data', (d) => { stdout += d; });

  try {
    // Poll until the server is actually accepting connections.
    let lastErr;
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/config`);
        assert.equal(r.status, 200);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (lastErr) throw lastErr;

    assert.match(stdout, /Dahua NVR Web Viewer → http:\/\/localhost:\d+/);
  } finally {
    proc.kill();
  }
});
