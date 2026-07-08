# Security Policy

## Supported versions

This is a solo-maintained hobby project with no version branches — only the latest commit on `main` is supported. There are no LTS releases and no backported fixes.

## Reporting a vulnerability

Please report security issues privately using GitHub's built-in reporting flow:

**Repository → Security tab → "Report a vulnerability"**

This opens a private advisory visible only to you and the maintainer, and is the preferred (and only) reporting channel for this project — please don't open a public issue for a security bug.

### What to expect

This is maintained by one person in their spare time. There is no SLA and no guaranteed response time. Reports will be triaged on a best-effort basis; realistically, expect an initial response within a few days to a couple of weeks, not hours. Confirmed issues will get a fix and a changelog note once available; there's no CVE-issuing process behind this project.

## Scope

**In scope:**

- This codebase — `server.js`, `src/`, `public/` — including auth/session handling, the CSRF guard, path sanitization, share-link scoping, and the digest-auth client used to talk to the NVR.

**Out of scope:**

- The Dahua NVR/DVR firmware itself. Report firmware vulnerabilities to Dahua.
- [go2rtc](https://github.com/AlexxIT/go2rtc) — a separate upstream project this app spawns as a child process. Report issues there.
- FFmpeg — report upstream at [ffmpeg.org](https://ffmpeg.org/).
- Vulnerabilities that require the attacker to already have valid NVR credentials or an already-compromised host running this app.

## Security measures already in place

The following protections exist today — please check the current `main` branch before reporting an issue that may already be addressed:

- **Content Security Policy** via `helmet`, with `script-src`/`style-src` locked down and no inline event-handler attributes anywhere in the served HTML.
- **CSRF protection**: a double-submit token (a non-`httpOnly` `csrfToken` cookie echoed back as the `X-CSRF-Token` header) is required on every state-changing request, in addition to `Sec-Fetch-Site`/`Origin` checks that reject cross-site requests outright.
- **Session and CSRF cookies** are set with `secure` (when the request is HTTPS, including behind a `trust proxy`-aware reverse proxy), `httpOnly` (session cookie only — the CSRF cookie must be readable by same-origin JS), and `sameSite=lax`.
- **Constant-time credential comparison** (`crypto.timingSafeEqual`) for login, to avoid timing side-channels on the username/password check.
- **Allow-list path validation** for NVR file paths (`sanitizeNvrPath`) — paths are matched against a strict `/mnt/...` shape rather than filtered against a blacklist of `..`-style patterns.
- **Scope-limited share links**: a share session can only reach `/api/stream`, `/api/download`, and `/api/nvr/*` — never `/api/search` — and is further restricted server-side to the specific channel/time-range (or file) the link was created for. Share links also expire server-side, independent of the cookie's own expiry.
- **No shell interpolation** when locating the `go2rtc` binary — a fixed candidate list is probed with `fs.accessSync`, never passed through a shell.
- **go2rtc's control API is bound to `127.0.0.1` only** and is never exposed to the network.
- Sessions and share links live in an in-memory store only — they're cleared on process restart and garbage-collected periodically (see `src/jobs/cleanup.js`), so there's no persistent token store to leak.

None of this replaces running the app behind a reverse proxy with TLS in production — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
