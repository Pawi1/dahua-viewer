# Getting Started

## 1. Find your NVR's IP address and credentials

Dahua NVRs/DVRs are usually configured with a static LAN IP by whoever installed them. If you don't know it:

- Check your router's DHCP client list / connected devices page for a device named something like `NVR` or a Dahua MAC prefix.
- Dahua's own "ConfigTool" / "SmartPSS" discovery utility (Windows) can find it by broadcast if you're on the same LAN segment.
- The default admin username is usually `admin`; the password is whatever was set during the NVR's initial setup wizard (Dahua devices force a password change on first boot — there's no fixed factory default password on modern firmware).

You'll need:
- The NVR's IP or hostname (`NVR_HOST`)
- The admin username/password (`NVR_USER` / `NVR_PASS`) — this app authenticates to the NVR with these same credentials, both for its own API calls and to gate login to the web UI itself
- How many camera channels it has (`NVR_CHANNELS`) — check the NVR's own web UI or physical channel count if unsure; getting this slightly wrong isn't fatal, `/api/nvr/channels` also asks the NVR directly and uses that live answer when it can

## 2. Open the required ports

This app needs to reach the NVR on two ports:

- **HTTP, default 80** (`NVR_PORT`) — recording search, system info, digest-auth API calls
- **RTSP, default 554** (`NVR_RTSP_PORT`) — the actual video stream, pulled by go2rtc

If the NVR viewer and the NVR are on the same LAN, this is usually already open. If the app runs elsewhere (a VPS, a different VLAN), you'll need routing/firewall rules to allow it to reach those two ports on the NVR — this app does not need any *inbound* ports opened on the NVR side beyond what it already listens on.

The app itself listens on `PORT` (default 3000). That's the port you (or your reverse proxy) connect to — see [Configuration](Configuration.md) and the repo's `docs/DEPLOYMENT.md` if you're exposing it beyond your LAN.

## 3. Install and start

```bash
# go2rtc binary + FFmpeg are required — see the main README's Installation section
npm install
NVR_HOST=192.168.1.108 NVR_USER=admin NVR_PASS=yourpassword node server.js
```

Then open `http://localhost:3000` (or whatever host/port you configured).

## 4. First login

The login screen asks for the same NVR admin username/password you configured via `NVR_USER`/`NVR_PASS` — there's no separate app-level account system. Successful login sets a session cookie valid for 8 hours; after that you'll need to log in again.

Once logged in you can:
- Search recordings by channel + time range
- Play a recording or a live channel
- Generate a share link for a specific clip (see Configuration for `SHARE_TTL_H`)
- Use the DAV → MP4 converter (`/converter.html`) on any `.dav` file, entirely in your browser
