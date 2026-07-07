# Dahua NVR Web Viewer

A web application for browsing and sharing recordings from Dahua NVR/DVR devices through a browser. No plugins, no ActiveX — pure WebRTC playback via go2rtc.

## Features

- **Recording search** by channel and time range (Dahua mediaFileFind API)
- **WebRTC playback** with hardware-accelerated decoding in the browser
- **Live view** for any channel
- **Seek** within recordings (restarts stream from new startTime via RTSP)
- **Resolution selection** — 480p / 720p / 1080p / native
- **Fragment download** — download a time-trimmed .dav clip
- **Share links** with configurable TTL — send a link without exposing NVR credentials
- **Login** — session-based authentication against NVR credentials
- **DAV → MP4 converter** (`/converter.html`) — in-browser conversion via ffmpeg.wasm; the file never leaves the client, the Node server only serves the static ffmpeg.wasm assets

## Requirements

- **Node.js** >= 18
- **go2rtc** — handles RTSP ingestion and WebRTC signaling
- **FFmpeg** — used by go2rtc to transcode H.265 → H.264 for browser compatibility
- Network access to the Dahua NVR (HTTP port 80 + RTSP port 554)

## Why go2rtc + FFmpeg

Dahua cameras record in H.265 (HEVC). Browsers on Linux do not support H.265 WebRTC unless hardware decode is available. go2rtc receives the RTSP stream, runs it through FFmpeg (`libx264`, `ultrafast`, `zerolatency`) to produce H.264, then delivers it via WebRTC. This keeps the Node.js server thin — it never touches video data.

## Installation

```bash
# 1. Install go2rtc
#    https://github.com/AlexxIT/go2rtc/releases
#    Place the binary somewhere in PATH or set GO2RTC_BIN

# 2. Install FFmpeg
sudo apt install -y ffmpeg       # Debian/Ubuntu
# brew install ffmpeg            # macOS

# 3. Install Node.js dependencies
npm install

# 4. Start
NVR_HOST=192.168.1.108 NVR_USER=admin NVR_PASS=yourpassword node server.js

# 5. Open browser
http://localhost:3000
```

For development with auto-restart:

```bash
npm run dev
```

## Environment Variables

| Variable        | Default       | Description                                        |
|-----------------|---------------|----------------------------------------------------|
| `NVR_HOST`      | 192.168.1.108 | NVR IP address or hostname                         |
| `NVR_PORT`      | 80            | NVR HTTP port                                      |
| `NVR_USER`      | admin         | NVR username                                       |
| `NVR_PASS`      | admin         | NVR password                                       |
| `NVR_RTSP_PORT` | 554           | NVR RTSP port                                      |
| `NVR_CHANNELS`  | 16            | Number of video channels                           |
| `PORT`          | 3000          | Web server port                                    |
| `SHARE_TTL_H`   | 72            | Default share link validity in hours (max 720)     |
| `SECRET_KEY`    | random        | HMAC key for session tokens; set for persistence   |
| `DEBUG`         | false         | Enable debug logging in the browser console        |
| `GO2RTC_BIN`    | go2rtc        | Path to the go2rtc binary                          |

## Architecture

```
NVR (RTSP)
    |
    v
go2rtc  <--  Node.js creates/destroys streams via go2rtc REST API
    |         (POST /api/stream/start → PUT go2rtc /api/streams)
    | WebRTC
    v
Browser  <-- SDP offer/answer proxied through /api/stream/offer
    |
    v
<video> element (H.264, hardware-decoded by browser)
```

go2rtc is launched as a child process of Node.js and configured via `go2rtc.yaml`. A runtime config file (`go2rtc-streams.yaml`) is written on startup with an empty `streams:` section; streams are added and removed dynamically while the server runs.

## API Endpoints

### Authentication

| Method | Path              | Description                                     |
|--------|-------------------|-------------------------------------------------|
| GET    | `/api/auth/check` | Returns `{ authenticated, type }` for current session |
| POST   | `/api/auth/login` | Body: `{ username, password }` — creates session cookie |
| POST   | `/api/auth/logout`| Invalidates session                             |

### NVR

| Method | Path               | Description                        |
|--------|--------------------|------------------------------------|
| GET    | `/api/nvr/info`    | NVR system info (model, firmware)  |
| GET    | `/api/nvr/channels`| Number of available channels       |

### Search

| Method | Path          | Description                                                      |
|--------|---------------|------------------------------------------------------------------|
| POST   | `/api/search` | Body: `{ channel, startTime, endTime }` — returns recording list |

Times use Dahua format: `"2025-01-15 08:00:00"`.

### Streaming

| Method | Path                   | Description                                                   |
|--------|------------------------|---------------------------------------------------------------|
| POST   | `/api/stream/start`    | Body: `{ channel, startTime, endTime, resolution?, filePath? }` — registers stream in go2rtc, returns `{ token }` |
| POST   | `/api/stream/offer`    | Query: `?token=` — proxies WebRTC SDP offer to go2rtc         |
| POST   | `/api/stream/heartbeat`| Body: `{ token }` — keeps stream alive; call every ~10s       |
| POST   | `/api/stream/stop`     | Body: `{ token }` — removes stream from go2rtc                |

Streams without a heartbeat for 60 seconds are garbage-collected automatically.

Resolution values: `480p` (default), `720p`, `1080p`, `native`.

### Download

| Method | Path            | Description                                                    |
|--------|-----------------|----------------------------------------------------------------|
| GET    | `/api/download` | Query: `channel + startTime + endTime` or `filePath` — pipes .dav from NVR. Optional `sample=N` to truncate to N seconds. |

### Share

| Method | Path              | Description                                                     |
|--------|-------------------|-----------------------------------------------------------------|
| POST   | `/api/share`      | Body: `{ channel, startTime, endTime, filePath?, ttlHours? }` — generates share token |
| GET    | `/api/share/:token` | Returns share link metadata                                   |
| GET    | `/share/:token`   | Redirect to player with a temporary read-only session (no search access) |

## go2rtc Configuration

The `go2rtc.yaml` file defines FFmpeg transcoding profiles and go2rtc API binding:

```yaml
api:
  listen: "127.0.0.1:1984"   # local only; never exposed to the network

ffmpeg:
  h264_480p:   "-vf scale=-2:480  -codec:v libx264 -preset ultrafast -tune zerolatency -crf 26"
  h264_720p:   "-vf scale=-2:720  -codec:v libx264 -preset ultrafast -tune zerolatency -crf 24"
  h264_1080p:  "-vf scale=-2:1080 -codec:v libx264 -preset ultrafast -tune zerolatency -crf 22"
  h264_native: "-codec:v libx264 -preset ultrafast -tune zerolatency -crf 20"
```

## Stack

| Component   | Role                                                       |
|-------------|------------------------------------------------------------|
| Node.js 18+ | HTTP server, Dahua API proxy, session/share management     |
| Express 4   | Routing                                                    |
| axios       | Dahua Digest Auth HTTP client                              |
| go2rtc      | RTSP ingestion, H.264 re-encoding via FFmpeg, WebRTC relay |
| FFmpeg      | H.265 → H.264 transcoding inside go2rtc                   |
| ffmpeg.wasm | In-browser DAV → MP4 conversion (`/converter.html`), no server round-trip |
| Browser     | WebRTC video (`<video>`), custom seekbar, WebRTC signaling |

## Security Notes

The application uses session cookies (`httpOnly`, `sameSite=lax`) validated against NVR credentials. Share links create read-only sessions scoped to the linked recording — they cannot access search or other channels.

For production, place behind a reverse proxy (nginx/Caddy) with TLS. go2rtc's API is bound to `127.0.0.1` only and is not exposed externally.

Sessions and share links are stored in memory — a server restart clears them.
