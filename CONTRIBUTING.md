# Contributing

Thanks for considering a contribution. This is a small, solo-maintained project — keep that in mind for the scope of PRs (see below).

## Dev setup

Requirements:

- Node.js >= 18
- `npm install`

To actually run the app against a real NVR you also need:

- The [go2rtc](https://github.com/AlexxIT/go2rtc/releases) binary (in `PATH` or pointed to via `GO2RTC_BIN`)
- FFmpeg installed and reachable by go2rtc
- Network access to a Dahua NVR/DVR (HTTP port 80 + RTSP port 554)

You do **not** need any of that to develop or run the test suite. Every route that talks to the NVR or to go2rtc is tested against a mocked `src/services/dahuaApi.js` / `src/services/go2rtcApi.js` (via `node:test`'s built-in module mocking, `t.mock.module`), and the server is exercised with `createApp()` against an ephemeral local port (`test-support/http.js`) — no live device required.

```bash
npm install
npm test              # run the full suite (128 tests)
npm run test:coverage # same, with a coverage report over src/ + server.js
```

## Before submitting a PR

- Run `npm test` and make sure it's green.
- If you're changing behavior (a route, middleware, a store, a util), add or update tests under the matching `test/` subfolder — tests are organized to mirror `src/` (`test/routes`, `test/middleware`, `test/services`, `test/utils`, `test/jobs`).
- Keep PRs small and focused on one change. Don't bundle an unrelated reformat, rename, or dependency bump into a feature/fix PR — it makes the diff harder to review and to revert if something breaks.
- No drive-by reformatting of code you're not otherwise touching.

## Code style

There's no linter configured in this repo currently, so style is enforced by convention/review rather than tooling. Match what's already there:

- 2-space indentation, `'use strict'` at the top of every CommonJS module (`require`/`module.exports`, no ESM in `src/`/`server.js` — ESM (`type="module"` scripts) is only used in `public/js/`).
- Comments are minimal and only added where the "why" isn't obvious from the code (e.g. explaining a non-obvious security tradeoff or a regex's intent) — don't add comments that just restate what the next line does.
- User-facing error strings returned in JSON responses are in Polish (matching the existing UI); log lines and code comments are in English.
- Small, composable functions over large ones; routes stay thin and delegate to `src/services/*` and `src/utils/*`.

## Commit messages

Recent history favors short, imperative, present-tense subject lines with no prefix, e.g.:

```
Fix cookie flags and add a real CSRF token CodeQL can recognize
Remove all inline event handlers and enable a real CSP
Replace blacklist path filter with an allow-list validator
```

(Older commits used a `feat:` prefix — that convention was dropped; don't reintroduce it.) Keep the subject line under ~70 characters and focused on one change; add a body only if the "why" needs more than the subject line.

## Reporting bugs / security issues

- Regular bugs: open a GitHub issue.
- Security vulnerabilities: see [SECURITY.md](SECURITY.md) — please don't file those as public issues.
