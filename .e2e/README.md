# E2E tests

Browser-level end-to-end tests for the extension. Runs the built extension in
a real (headful) Edge/Chromium via Playwright against two in-memory Gotify API
mocks, and drives the actual options-page UI.

## Run

```bash
bun run build          # rebuild dist/chromium first (tests load that build)
cd .e2e
bun install            # installs Playwright (uses the system browser, no download)
bun run e2e.ts
```

Requires Edge (or edit `channel` to `chrome`). The run opens a visible browser
window and takes ~2–3 minutes.

## What it covers

- S1–S2: fresh install, first server login, message list
- S2b–S4: header server dropdown, adding a second server, switching servers
- S5–S5b: settings dialog server list, per-server poll intervals
- S7–S7b: live polling, per-server unread counts, badge total, namespaced
  native notification ids
- S8: reopening the UI clears unread and badge
- S9: message delete (exercises the Origin-stripping DNR rule — the mock
  rejects DELETEs that carry an Origin header, like the real Gotify)
- S10: server removal cleans up config, state and DNR rules
- S11–S11b: legacy single-server storage migration across extension reload

The mocks (`mock-gotify.ts`) require `X-Gotify-Key` on every request and serve
pages newest-first, matching real Gotify behavior.
