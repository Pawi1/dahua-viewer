# Troubleshooting

## Black screen / no video when playing a recording or live view

This almost always means the WebRTC stream never made it from the NVR to your browser. The chain is: NVR (RTSP) → go2rtc → FFmpeg (transcode) → WebRTC → browser. Check each hop:

1. **Is go2rtc actually running?** It's spawned as a child process of the Node server on startup (see `[go2rtc] ...` lines in the server log). If it failed to start, you'll see `[go2rtc] failed to start: ...` — usually means the binary isn't installed or isn't at the path configured via `GO2RTC_BIN` (see [Configuration](Configuration.md)).
2. **Did `POST /api/stream/start` succeed?** Open the browser dev tools Network tab and look for a `500` with `"Nie można uruchomić strumienia"` — this means go2rtc rejected the stream registration (check the server log for the underlying go2rtc error, e.g. it couldn't open the RTSP source).
3. **Is FFmpeg installed?** go2rtc shells out to FFmpeg to transcode H.265 → H.264. If FFmpeg isn't installed or isn't on `PATH` for the user running go2rtc, the transcode silently fails and no video ever arrives.
4. **Is the NVR reachable on RTSP (554) from the server?** If HTTP search/login works but playback doesn't, the NVR's RTSP port might be blocked by a firewall/VLAN rule that doesn't affect HTTP. See [Getting Started](Getting-Started.md#2-make-sure-the-right-ports-are-reachable).
5. **Firewall/NAT between browser and server, not just server and NVR** — WebRTC media itself flows more or less directly between go2rtc and the browser (peer-to-peer style, via the STUN server configured in the CSP's `connectSrc`); if the browser is on a very restrictive network, that negotiation can fail even though the signaling (`/api/stream/offer`) succeeds.

## "Link wygasł" (link expired) when opening a share link

Share links have a server-side expiry (`shareStore.getValid()` — see [ARCHITECTURE.md](../ARCHITECTURE.md#share-links-srcservicessharestorejs-srcroutessharejs)), not just a client-side one. This message appears when:

- The link's TTL (set at creation time, capped at 720h / 30 days) has actually passed.
- The token doesn't exist at all — most commonly because **the server was restarted** since the link was created. Share links live only in memory (`Map`), so a restart invalidates every outstanding link immediately, regardless of its configured TTL.

If you need share links to survive planned restarts/deployments, that's a known current limitation — see [DEPLOYMENT.md](../DEPLOYMENT.md#in-memory-state--no-horizontal-scaling-without-a-shared-store). The fix today is simply to generate a new link.

## NVR connection errors ("Nieprawidłowe dane logowania", search/info failures, timeouts)

- **Login fails immediately** — `NVR_USER`/`NVR_PASS` (what VideoParagon's own login screen checks against) must match the actual NVR credentials, since they're the same value used to authenticate to the NVR's CGI API. Double check for typos, and remember these are compared byte-for-byte (constant-time comparison) — no partial/case-insensitive match.
- **Login works but everything else times out or errors** — this usually means digest authentication to the NVR is failing on individual CGI calls (search, download, device info), which is a slightly different path than the login check. Confirm the server can reach the NVR on its HTTP port (`NVR_PORT`, default `80`) and that the credentials are also valid for CGI access (some NVR configurations restrict certain accounts).
- **Everything about search/device info is slow or times out** — the NVR CGI client has a 15s timeout; if the NVR is on a slow/lossy link this can legitimately trip. Check basic network reachability (ping/traceroute) to `NVR_HOST` first.
- **RTSP-specific failures only** (playback/live view fails but search/login are fine) — check `NVR_RTSP_PORT` (default `554`) is reachable; some networks block RTSP specifically even when HTTP is open.

## Video plays but looks wrong, or won't play only in some browsers

Dahua NVRs record in **H.265 (HEVC)**, which most browsers cannot decode over WebRTC without hardware acceleration. VideoParagon relies on go2rtc + FFmpeg to always transcode to **H.264** before the stream reaches the browser, specifically so this shouldn't matter to end users. If you suspect an H.265 stream is somehow reaching the browser untranscoded (e.g. video won't play in Firefox but plays in Chrome, or vice versa in an unusual way), that points at the FFmpeg transcoding step itself failing or being bypassed rather than a browser codec-support quirk — check the go2rtc/FFmpeg logs from the server process for transcode errors, and confirm the resolution/profile selected (480p/720p/1080p/native) maps to a valid entry in `go2rtc.yaml`.