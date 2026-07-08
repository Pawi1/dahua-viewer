# Deployment

## Reverse proxy + TLS

The app itself only speaks plain HTTP. In production, put it behind a reverse proxy that terminates TLS and forwards to the Node process over local HTTP/loopback.

`server.js` sets `app.set('trust proxy', 1)`, which tells Express to trust one hop of `X-Forwarded-*` headers from the proxy in front of it. This matters because `req.secure` — used to decide whether the `session_id` and `csrfToken` cookies get the `secure` flag — is otherwise always `false` behind a proxy (Express only sees plain HTTP on the loopback hop). Without `trust proxy` set correctly, either cookies would never get `secure` (a real weakening in production) or, if you're not actually behind a proxy, `X-Forwarded-Proto` could be spoofed by a client to fake HTTPS. Only set this behind a proxy you control, and make sure the proxy strips any client-supplied `X-Forwarded-Proto`/`X-Forwarded-For` before setting its own.

### nginx example

```nginx
server {
    listen 443 ssl;
    server_name nvr.example.com;

    ssl_certificate     /etc/letsencrypt/live/nvr.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nvr.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebRTC signaling (SDP offer/answer) goes through this same HTTP
        # proxy — the actual media is peer-to-peer/STUN, not proxied here.
        proxy_read_timeout 60s;
    }
}

server {
    listen 80;
    server_name nvr.example.com;
    return 301 https://$host$request_uri;
}
```

### Caddy example

```
nvr.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy handles TLS (including cert acquisition) and sets `X-Forwarded-Proto` automatically.

## Process management

The app has two long-running pieces: the Node.js process (`server.js`, which itself spawns `go2rtc` as a child process on startup). Keep both alive with your process supervisor of choice.

### systemd unit example

```ini
[Unit]
Description=Dahua NVR Web Viewer
After=network.target

[Service]
Type=simple
User=nvrviewer
WorkingDirectory=/opt/dahua-viewer
Environment=NODE_ENV=production
Environment=NVR_HOST=192.168.1.108
Environment=NVR_USER=admin
Environment=NVR_PASS=changeme
Environment=SECRET_KEY=<a fixed random value — see below>
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Put real credentials in an `EnvironmentFile=` instead of inline `Environment=` lines so they aren't visible in `systemctl status`/`journalctl` unit dumps or world-readable unit files.

Since `server.js` spawns `go2rtc` itself as a child process, systemd only needs to manage the Node process — killing it also terminates its go2rtc child.

### pm2 example

```bash
pm2 start server.js --name dahua-viewer
pm2 save
```

## `SECRET_KEY`

If unset, `src/config/index.js` generates a random 32-byte key on every process start. That's fine for a single long-running instance, but if you restart the process frequently or ever run more than one instance, set `SECRET_KEY` explicitly to a fixed random value (`openssl rand -hex 32`) via the environment. In the current codebase this key is generated but not actually used to sign anything cookie-related yet (session/CSRF tokens are random bytes, not HMAC-signed) — treat it as reserved/forward-looking configuration rather than something with an immediate security effect today.

## Scaling limitation: in-memory state

Sessions, share links, and active stream registrations (`src/services/sessionStore.js`, `shareStore.js`, `streamStore.js`) are plain in-memory `Map`s with no external backing store (no Redis, no database). This means:

- **No horizontal scaling.** Running multiple instances behind a load balancer will not work correctly — a session created by instance A is invisible to instance B, so requests routed to a different instance than the one that issued the cookie will get `401`s.
- **State does not survive a restart.** All logged-in sessions, outstanding share links, and stream tokens are lost on process restart; users have to log back in and streams have to be re-started (the periodic GC job in `src/jobs/cleanup.js` doesn't persist anything either — it just prunes the in-memory maps).

For a single self-hosted instance (the expected use case) this is a non-issue. If you need multiple instances or restart-durability, the stores would need to move to a shared backend (e.g. Redis) — that's not implemented today.

## Network requirements recap

- Node.js process needs outbound access to the NVR on its HTTP port (`NVR_PORT`, default 80) and RTSP port (`NVR_RTSP_PORT`, default 554).
- go2rtc's control API binds to `127.0.0.1:1984` only — do not expose this port externally, and don't need to open it in any firewall config beyond loopback.
- The reverse proxy needs to reach the Node.js port (default 3000) — bind that to loopback too if the proxy runs on the same host.
