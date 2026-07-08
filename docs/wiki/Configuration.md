# Configuration

All configuration is via environment variables (`src/config/index.js`), set however you normally set env vars for a Node process (shell export, `.env` loaded by your process manager, systemd `Environment=`/`EnvironmentFile=`, etc. — the app itself does not load a `.env` file automatically).

| Variable        | Default       | Description |
|-----------------|---------------|-------------|
| `NVR_HOST`      | 192.168.1.108 | NVR IP address or hostname. Change this to point at your actual device — the default is just a common LAN placeholder. |
| `NVR_PORT`      | 80            | NVR's HTTP port. Only change this if your NVR's web UI/API has been moved off port 80 (some setups do this to avoid clashing with other services, or because port 80 is forwarded to something else on the router). |
| `NVR_USER`      | admin         | NVR username used both for the app's login screen and for every API call the server makes to the NVR. There's no separate app-level account — whoever knows these credentials can log in. |
| `NVR_PASS`      | admin         | NVR password. The default here is a placeholder, not a working credential on real devices — Dahua forces a password change on first setup, so you must set this to your NVR's actual admin password. |
| `NVR_RTSP_PORT` | 554           | NVR's RTSP port, used by go2rtc to pull the video stream. Change only if you've moved RTSP off the standard port. |
| `NVR_CHANNELS`  | 16            | Fallback channel count, used only if the live `/api/nvr/channels` lookup against the NVR fails. Set this to your actual channel count if you want a sane fallback during NVR downtime; otherwise it's mostly cosmetic. |
| `PORT`          | 3000          | Port the Node.js app itself listens on. Change if 3000 conflicts with something else, or if you're running multiple instances (see the scaling caveat in `docs/DEPLOYMENT.md` — multiple instances don't share sessions). |
| `SHARE_TTL_H`   | 72            | Default validity (in hours) of a share link when the requester doesn't specify one explicitly. Hard-capped at 720 (30 days) regardless of what's configured or requested. Lower this if you want share links to expire faster by default; the per-link `ttlHours` can still override it up to the 720h cap. |
| `SECRET_KEY`    | random        | Reserved configuration key, generated randomly on every process start if unset. Set it explicitly (e.g. `openssl rand -hex 32`) if you want a stable value across restarts, though nothing in the current code depends on it being stable — session/share tokens are independently random and don't need it to survive a restart. |
| `DEBUG`         | false         | Enables verbose debug logging in the *browser* console (returned via `/api/config`), not server-side logs. Useful when troubleshooting playback/WebRTC issues client-side; leave off in normal use. |
| `GO2RTC_BIN`    | go2rtc        | Path to the go2rtc binary, if it's not one of the auto-detected locations (`PATH`, `/usr/local/bin/go2rtc`, `/usr/bin/go2rtc`, `/bin/go2rtc`). Set this if you installed go2rtc to a custom location. |

## Things you'll actually want to change

- **`NVR_HOST` / `NVR_USER` / `NVR_PASS` / `NVR_RTSP_PORT`** — always, to match your real device. These have no safe defaults for a real deployment.
- **`SHARE_TTL_H`** — if you routinely share clips with people you don't want to have long-standing access, lower this from the 72h default.
- **`PORT`** — if it clashes with another service, or you're putting a reverse proxy in front (see `docs/DEPLOYMENT.md`).
- **`GO2RTC_BIN`** — only if go2rtc isn't found automatically; you'll see a `[go2rtc] failed to start` error in the logs if so.

Things you'll rarely need to touch: `NVR_PORT` (unless you've customized the NVR's own web port), `NVR_CHANNELS` (it's a fallback, not authoritative), `SECRET_KEY` (only matters if you have a specific reason to want it fixed), `DEBUG` (a client-side troubleshooting toggle).
