# API Reference

Base URL: wherever the app is deployed (default `http://localhost:3000`). All request/response bodies are JSON unless noted otherwise.

Every endpoint except `GET /api/config`, `/api/auth/*`, and `/share/:token` requires a valid session cookie (`session_id`) — see [ARCHITECTURE.md](ARCHITECTURE.md#auth-middleware-and-share-scoping). Every state-changing request (`POST`/`PUT`/`PATCH`/`DELETE`) also requires:

- A `csrfToken` cookie (issued automatically on first request to any endpoint).
- An `X-CSRF-Token` header equal to that cookie's value.
- A same-origin `Origin` header / `Sec-Fetch-Site: same-origin` (or absent, e.g. non-browser clients).

Requests failing the CSRF check get `403 { "error": "Cross-site request zablokowany" }` or `403 { "error": "Nieprawidłowy token CSRF" }`. Requests without a valid session get `401 { "error": "Unauthorized" }`; requests from a share session outside its allowed paths/scope get `403 { "error": "Forbidden" }`.

## Config

### `GET /api/config`

Public. No auth, no CSRF concerns (safe method).

**Response `200`:**
```json
{ "debug": false }
```

## Auth

### `GET /api/auth/check`

Public. Reports whether the current `session_id` cookie is valid.

**Response `200`:**
```json
{ "authenticated": true, "type": "full" }
```
or
```json
{ "authenticated": false }
```

`type` is `"full"` (logged in with NVR credentials) or `"share"` (redeemed a share link).

### `POST /api/auth/login`

Public (pre-auth). Body:
```json
{ "username": "admin", "password": "yourpassword" }
```

Credentials are compared against `NVR_USER`/`NVR_PASS` using `crypto.timingSafeEqual` (constant-time).

**Response `200`:** `{ "success": true }` and sets `session_id` cookie (`httpOnly`, `secure` when HTTPS, `sameSite=lax`, 8h `maxAge`).

**Response `401`:** `{ "success": false, "error": "Nieprawidłowe dane logowania" }`

### `POST /api/auth/share`

Public (pre-auth). Redeems a share token into a session without the redirect that `GET /share/:token` does — useful for API-driven clients. Token via query string (`?token=`) or body (`{ "token": "..." }`).

**Response `200`:** `{ "success": true }`, sets a scoped `session_id` cookie expiring with the share link.

**Response `410`:** `{ "success": false, "error": "Link wygasł" }` — token missing, unknown, or expired.

### `POST /api/auth/logout`

Requires no auth check itself (mounted under `/api/auth`, public), but is only meaningful with a session cookie present. Deletes the session server-side and clears the `session_id` cookie.

**Response `200`:** `{ "success": true }`

## NVR

All require a session.

### `GET /api/nvr/info`

Calls Dahua `magicBox.cgi?action=getSystemInfo` and returns the parsed key/value response (e.g. `deviceType`, `serialNumber`, hardware/firmware fields — whatever the NVR reports).

**Response `200`:** `{ "success": true, "info": { "...": "..." } }`

**Response `500`:** `{ "success": false, "error": "<message>" }` on NVR/network failure.

### `GET /api/nvr/time`

Calls Dahua `global.cgi?action=getCurrentTime`. Used by the live-view player to align "now" with the NVR's own clock rather than the browser's.

**Response `200`:**
```json
{ "success": true, "time": "2026-05-29 14:23:11" }
```

**Response `500`:** `{ "success": false, "error": "<message>" }`

### `GET /api/nvr/channels`

Calls Dahua `devVideoInput.cgi?action=getCollect` and parses a `count=` field out of the raw response. Falls back to the configured `NVR_CHANNELS` value (never errors to the caller) if the NVR call fails.

**Response `200`:** `{ "success": true, "count": 16 }`

## Search

### `POST /api/search`

Requires a `'full'` session — not reachable from a share session (not in the share allow-list).

Body:
```json
{
  "channel": 1,
  "startTime": "2025-01-15 08:00:00",
  "endTime": "2025-01-15 09:00:00",
  "types": ["dav", "mp4"],
  "flags": []
}
```
`channel`, `startTime`, `endTime` are required (Dahua time format, space-separated, no timezone). `types` defaults to `["dav", "mp4"]`. `flags` is optional (Dahua recording-type flags, e.g. event/motion filters); omitted or empty means no flag filter.

Internally opens a Dahua `mediaFileFind` search object, pages through `findNextFile` in batches of 100, and always closes/destroys the search object in a `finally` block even on error.

**Response `200`:**
```json
{
  "success": true,
  "found": 2,
  "files": [
    {
      "id": 0,
      "startTime": "2025-01-15 08:00:00",
      "endTime": "2025-01-15 08:10:00",
      "filePath": "/mnt/dvr/sda0/2025/1/15/dav/08.00.00-08.10.00[R][0@0][0].dav",
      "type": "dav",
      "duration": 600,
      "length": 12345678,
      "channel": 1,
      "events": ["Motion"]
    }
  ]
}
```

**Response `400`:** `{ "error": "Brak wymaganych parametrów: channel, startTime, endTime" }`

**Response `500`:** `{ "success": false, "error": "<message>" }`

## Streaming

### `POST /api/stream/start`

Body — either a live/playback request:
```json
{ "channel": 1, "startTime": "2025-01-15 08:00:00", "endTime": "2025-01-15 08:10:00", "resolution": "720p" }
```
or a direct-file request:
```json
{ "filePath": "/mnt/dvr/sda0/2025/1/15/dav/08.00.00-08.10.00[R][0@0][0].dav", "resolution": "480p" }
```

`resolution` is one of `480p` (default), `720p`, `1080p`, `native` — maps to the matching FFmpeg profile in `go2rtc.yaml`. For a share session, `channel`/`filePath`/time range must fall within the link's scope (see [ARCHITECTURE.md](ARCHITECTURE.md#auth-middleware-and-share-scoping)) or the request never reaches this handler (`403` from `authMiddleware` first).

Registers a stream with go2rtc (`ffmpeg:rtsp://...#video=<profile>#hardware` or an `RPC_Loadfile` HTTP source for a direct file) and returns an opaque token used by the next three endpoints.

**Response `200`:** `{ "success": true, "token": "a1b2c3..." }`

**Response `400`:** `{ "success": false, "error": "Nieprawidłowa ścieżka pliku" }` (bad `filePath`) or `{ "success": false, "error": "Brak parametrów" }` (neither a channel/time range nor a `filePath` given).

**Response `500`:** `{ "success": false, "error": "Nie można uruchomić strumienia" }` if go2rtc rejects the stream.

### `POST /api/stream/offer`

Query: `?token=<token>`. Body: raw SDP offer (`Content-Type` accepted as anything — parsed with `express.text({ type: '*/*' })`). Proxies the offer to go2rtc's `/api/webrtc` and returns the SDP answer as the raw response body.

**Response `200`:** raw SDP answer text, `Content-Type: application/x-www-form-urlencoded`.

**Response `404`:** `Nieznany token` (plain text) — token not found in `streamStore` (never started, or already GC'd).

**Response `500`:** `Błąd WebRTC` (plain text) on a go2rtc error.

### `POST /api/stream/heartbeat`

Body: `{ "token": "a1b2c3..." }`. Call roughly every 10 seconds while a stream is being watched; a stream not GC'd within its allowed heartbeat gap is torn down automatically (see cleanup job in ARCHITECTURE.md).

**Response `200`:** `{ "ok": true }` if the token is a known, still-active stream; `{ "ok": false }` otherwise (unknown token or already ended) — this endpoint never errors, it just reports whether the ping had an effect.

### `POST /api/stream/stop`

Body: `{ "token": "a1b2c3..." }` (accepts JSON, `text/plain`, or `application/octet-stream` — useful for `navigator.sendBeacon` on tab close). Tears the stream down in go2rtc and marks it ended in `streamStore`.

**Response `200`:** `{ "success": true }` — always, whether or not the token was actually found.

## Download

### `GET /api/download`

Query, one of two shapes:

- `?filePath=/mnt/...` — direct file download via `RPC_Loadfile`. Ignored if `sample` is also present (sampling only applies to the time-range form).
- `?channel=1&startTime=2025-01-15%2008:00:00&endTime=2025-01-15%2008:10:00` — time-range download via `loadfile.cgi`. Optional `sample=N` truncates the requested window to N seconds from `startTime` (used for generating short preview clips) — `endTime` is recomputed from `startTime + N` and the original `endTime` is ignored in that case.

Streams the NVR's response straight through with `Content-Disposition: attachment` and `Content-Type: application/octet-stream`; `Content-Length` is forwarded when the NVR provides it.

**Response `200`:** binary `.dav` stream.

**Response `400`:** `{ "error": "Nieprawidłowa ścieżka pliku" }`, `{ "error": "Brak parametrów" }` (missing `channel`/`startTime`), or `{ "error": "Brak endTime" }` (no `endTime` and no `sample` to derive one from).

**Response `500`:** `{ "error": "<message>" }` — only if headers haven't already been sent (i.e. the NVR connection failed before streaming started; a mid-stream failure is only logged, since the response has already begun).

## Share

### `POST /api/share`

Requires a `'full'` session (not reachable from an existing share session).

Body:
```json
{ "channel": 1, "startTime": "2025-01-15 08:00:00", "endTime": "2025-01-15 08:10:00", "filePath": null, "ttlHours": 24 }
```

`ttlHours` defaults to `SHARE_TTL_H` and is capped at 720 (30 days) regardless of what's requested.

**Response `200`:**
```json
{
  "success": true,
  "token": "d4e5f6...",
  "url": "https://your-host/share/d4e5f6...",
  "expiresAt": "2025-01-16T08:00:00.000Z",
  "ttlHours": 24
}
```

**Response `400`:** `{ "error": "Brak wymaganych danych" }`

### `GET /api/share/:token`

Returns share metadata without redeeming/creating a session. Requires a session itself (mounted after `authMiddleware`) — this is for the app's own UI to look up a link's details, not for anonymous recipients (they use `GET /share/:token` at the page router below).

**Response `200`:** `{ "channel": 1, "startTime": "...", "endTime": "...", "filePath": null, "expiresAt": "2025-01-16T08:00:00.000Z", "ttl": 24 }`

**Response `410`:** `{ "error": "Link wygasł" }`

### `GET /share/:token`

Public (mounted before `authMiddleware`). What an anonymous recipient's browser hits when they open a share link. Validates the token, creates a scoped `'share'` session cookie, and redirects (`302`) to `/?mode=share&token=...&ch=...&start=...&end=...&autoplay=1[&fp=...]` so the front-end loads directly into the player.

**Response `410`:** a small standalone HTML "410 — Ten link wygasł lub jest nieprawidłowy" page (not JSON — this is hit directly by a browser navigating to the link, not by API code).
