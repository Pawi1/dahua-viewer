# Architecture

This expands on the README's high-level diagram with the actual wiring in `server.js` and `src/`.

## Request pipeline (`createApp()`)

`server.js` exports `createApp()`, a pure function that builds and returns an Express app with no side effects (no `listen()`, no spawning go2rtc) — this is what lets the test suite exercise the whole app on an ephemeral port without a real NVR. Middleware is applied in this order:

1. `app.set('trust proxy', 1)` — trusts one hop of `X-Forwarded-*` headers, so `req.secure` reflects `X-Forwarded-Proto` when the app runs behind a reverse proxy (see [DEPLOYMENT.md](DEPLOYMENT.md)). Without this, cookies marked `secure` would never be sent back by the browser in a TLS-terminating-proxy setup, because Express would see every request as plain HTTP.
2. `cookie-parser` — parses `session_id` and `csrfToken` cookies into `req.cookies`.
3. `express.json()` — parses JSON bodies.
4. `csrfGuard` (`src/middleware/csrf.js`) — runs before helmet and before any route. Issues the `csrfToken` cookie on first contact if missing, then for `POST`/`PUT`/`PATCH`/`DELETE` requests checks `Sec-Fetch-Site`, `Origin`, and the `X-CSRF-Token` header against the cookie. This runs globally, including in front of `/api/auth/login`, so even the login endpoint is CSRF-protected.
5. `helmet()` — security headers, including a locked-down CSP (see the annotated directives in `server.js`: `scriptSrcAttr: 'none'` guards against reintroducing inline event handlers; `workerSrc`/`scriptSrc` allow `'wasm-unsafe-eval'` and `blob:` specifically for ffmpeg.wasm's worker-based encoder; `styleSrc` still allows `'unsafe-inline'` because `index.html`/`converter.html` use inline `style="..."` and inline `<style>` blocks).
6. Static file serving: `public/` at `/`, plus three narrow static mounts under `/ffmpeg/{ffmpeg,core,util}` that serve the corresponding `@ffmpeg/*` npm package's `dist/esm` build — this is how `converter.html` loads ffmpeg.wasm without a CDN dependency (which the CSP wouldn't allow anyway).
7. `GET /api/config` and `/api/auth/*` and `/share/*` are mounted next, **before** `authMiddleware` — they must be reachable without a session (login itself, checking auth state, and resolving/redeeming a share link all happen pre-auth).
8. `authMiddleware` (`src/middleware/auth.js`) is mounted after that point, so everything registered after it — `/api/search`, `/api/stream`, `/api/download`, `/api/nvr`, `/api/share` — requires a valid session.

## Auth middleware and share scoping

`authMiddleware` looks up `req.cookies.session_id` in `sessionStore`. Two session `type`s exist:

- `'full'` — created by `/api/auth/login` after a credential check; unrestricted access to everything behind the middleware.
- `'share'` — created by redeeming a share token (`/api/auth/share`, or by visiting `/share/:token` which does the same thing and then redirects into the player UI). A share session carries a `scope` (`channel`, `startTime`, `endTime`, `filePath`).

For `'share'` sessions, `authMiddleware` enforces two layers:

- **Path allow-list** (`SHARE_ALLOWED_PREFIXES`): only `/api/stream/*`, `/api/download`, `/api/nvr/*` are reachable — `/api/search` is not in the list, so a share link can never browse the NVR's recordings, only play/download the one clip it was scoped to.
- **Parameter scoping** (`SHARE_SCOPED_PREFIXES`: `/api/stream/start`, `/api/download`): `withinShareScope()` checks that the request's `channel`/`filePath` matches the scope, and that any requested `startTime`/`endTime` falls inside the scope's original window — a share session can't be used to widen the time range or switch channels by editing the request.

## go2rtc process lifecycle

`startGo2rtc()` in `server.js` (called only from the `require.main === module` entry point, not from `createApp()`, so tests never spawn a real go2rtc):

1. Resolves the binary path by probing a fixed candidate list — `GO2RTC_BIN` env var, then `/usr/local/bin/go2rtc`, `/usr/bin/go2rtc`, `/bin/go2rtc` — with `fs.accessSync(path, X_OK)`, falling back to the bare command `go2rtc` (resolved via `PATH`) if none of the candidates are executable. No shell interpolation is involved anywhere in this resolution.
2. Reads the static `go2rtc.yaml` (API binding, FFmpeg transcode profiles, WebRTC ICE server, log level), strips its `streams:` section (which is empty/absent — streams are always managed at runtime), and writes the result plus a fresh empty `streams:` key to `go2rtc-streams.yaml` — the file actually passed to go2rtc via `-config`. This runtime file is regenerated on every startup, so any streams left over from an unclean shutdown are dropped.
3. Spawns `go2rtc -config go2rtc-streams.yaml` as a child process with piped stdio, and forwards its stdout/stderr to the parent process's stdout prefixed with `[go2rtc]`.

Streams themselves are added/removed while the app runs by calling go2rtc's own REST API (`src/services/go2rtcApi.js`, `http://127.0.0.1:1984`, matching `go2rtc.yaml`'s `api.listen`):

- `createStream(name, src)` → `PUT /api/streams?name=...&src=...` — `src` is an FFmpeg source string like `ffmpeg:rtsp://user:pass@host:554/cam/playback?...#video=h264_480p#hardware`, built in `src/routes/stream.js` from the requested channel/time-range or NVR file path.
- `webrtcOffer(name, sdpOffer)` → `POST /api/webrtc?src=...` — proxies the browser's SDP offer to go2rtc and returns the SDP answer.
- `deleteStream(name)` → `DELETE /api/streams?name=...` — tears the stream down; errors are swallowed since this is best-effort cleanup.

## In-memory stores and the GC job

Three plain `Map`s under `src/services/`, all in-memory only (cleared on process restart, no external store):

| Store | Keyed by | Value | Notes |
|---|---|---|---|
| `sessionStore` | session id | `{ type, expiresAt, scope }` | `create()`/`get()`/`del()`/`cleanup()`; `get()` lazily deletes expired entries too |
| `shareStore` | share token | `{ channel, startTime, endTime, filePath, expiresAt, ttl }` | plain `Map` with an added `getValid(token)` helper that centralizes the "exists and not expired" check |
| `streamStore` | stream token | `{ rtspUrl, startedAt, endedAt, logDesc, lastHeartbeat }` | tracks active/recently-ended go2rtc streams |

`src/jobs/cleanup.js` (`startCleanupJob()`) runs every 15 seconds and does three things:

1. Deletes any `shareStore` entry past its `expiresAt`.
2. Calls `sessionStore.cleanup()` to drop expired sessions.
3. Walks `streamStore`: for streams already marked `endedAt`, deletes them from memory after a 2-hour grace window (`STREAM_MEM_TTL`); for streams still "live", if no heartbeat (`POST /api/stream/heartbeat`, expected roughly every 10s from the player) has arrived in 60 seconds (`HEARTBEAT_TTL`), it calls `go2rtcApi.deleteStream()` and marks the entry ended. This is what actually tears down a go2rtc stream when a viewer closes the tab without calling `/api/stream/stop`.

## Digest auth to the NVR

`src/services/dahuaApi.js` is a shared axios instance (`baseURL: http://<nvrHost>:<nvrPort>`, 15s timeout, `transformResponse` disabled so callers get the raw key=value text Dahua's CGI endpoints return) used by every route that talks to the NVR (`search`, `download`, `nvr`, and indirectly `stream` for building playback URLs).

`src/middleware/digestAuth.js` (`addDigestAuth(instance, user, pass)`) attaches a response interceptor that:

1. Lets non-401 or already-retried (`cfg._digestRetry`) responses pass through untouched.
2. On a `401` whose `WWW-Authenticate` header is a Digest challenge, parses `realm`/`nonce`/`opaque`/`qop` out of it.
3. Computes `HA1 = MD5(user:realm:pass)` and `HA2 = MD5(method:uri)`, then the response hash — using the `qop` variant (`HA1:nonce:nc:cnonce:qop:HA2`) when the server offers `qop`, else the simpler `HA1:nonce:HA2`.
4. Retries the original request once with an `Authorization: Digest ...` header built from those values, marking `cfg._digestRetry = true` to prevent infinite retry loops.

This means every NVR call transparently re-authenticates on the first request of a session (or whenever the NVR's nonce rotates) without the rest of the codebase needing to know digest auth exists.
