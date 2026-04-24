# Roadmap

## v0 — Scaffold (this commit)

- [x] Monorepo layout (npm workspaces)
- [x] Rust collector skeleton with window + idle samplers
- [x] Electron main process: collector bridge, SQLite, sessionizer, IPC
- [x] React renderer skeleton: Today / Timeline / Weekly / Categories / Settings
- [x] Shared types + default category rules + scoring stub

## v0.1 — Pipeline end-to-end

- [ ] Collector heartbeat → sessionizer → DB writes verified
- [ ] Today page shows real per-app totals from SQLite
- [ ] Timeline strip renders today's events as colored bars
- [ ] Tray icon + show/hide window

## v0.2 — Browser intelligence

- [x] UI Automation address-bar reader for Chromium browsers (Chrome, Edge, Brave, Vivaldi, Arc, Opera)
- [x] UI Automation address-bar reader for Firefox
- [x] History-file fallback (`Local State` profile mapping)
- [x] Incognito / private-window detection and skip
- [x] Per-browser-profile breakdown in Today view

## v0.3 — App intelligence

- [ ] VSCode / Cursor project extraction from window title (already in `packages/defaults`)
- [ ] JetBrains IDE project extraction
- [ ] Slack / Discord workspace+channel extraction
- [ ] Figma / Notion document extraction
- [ ] Office / Google Docs document extraction
- [ ] Unknown-app surfacing UI ("we saw a new app: classify it")

## v0.7 — AI review + notifications

- [x] AI narrative review (daily + weekly) using llama-3.3-70b
- [x] Tagging cadence relaxed to hourly + EOD pass (was every 2 min)
- [x] Threshold-based notifier: non-productive minutes/day (default 180)
- [x] OS toast notifications (Electron Notification)
- [x] SMTP email notifications via nodemailer (host/port/secure/auth/from/to)
- [x] Per-category opt-in for "non-productive" — defaults Entertainment + Social
- [x] Notification audit log in DB
- [x] Settings UI: live status, threshold control, channel toggles, SMTP form, test send
- [x] AiReviewCard surfaced on Today / Weekly / saved Reports with "Generate now" button
- [ ] Webhook channel (Slack/Discord) as alternative to SMTP
- [ ] Per-hour "you're slipping" mid-day nudges (separate from EOD summary)

## v0.6 — AI insights (semantic categorization)

- [x] User-managed category taxonomy (CRUD with name, description, color, weight, daily/weekly targets)
- [x] Defaults seeded: Work, Religion, Learning (SE), Business, Entertainment, Social, Other
- [x] AI classifier service (Groq, llama-3.1-8b-instant) — background tick every 2 min, batched + dedup'd
- [x] AI tags override deterministic rules in the categorization layer (manual > AI > rule)
- [x] Per-category "health" bars on Today / Weekly / saved reports (actual vs target)
- [x] Groq API key stored locally in SQLite settings (or `GROQ_API_KEY` env override)
- [x] Manual "Run AI tagging now" button + AI status panel in Settings
- [ ] Manual override: click any event in the timeline to re-tag it
- [ ] Per-domain "skip AI" allowlist + cost dashboard
- [ ] Cache classifications by `(domain, normalized-title)` across days

## v0.4 — Reports

- [x] Daily report card auto-generated at end of day (23:55 local, configurable cutoff coming in v0.5)
- [x] Sunday weekly report with week-over-week trends
- [x] Productivity + Focus scores per day/week
- [x] Top distractions, deep-work hour count, context-switch storms
- [x] Export report as PNG / PDF
- [x] Reports history page (browse saved daily + weekly reports)

## v0.5 — Polish + ship

- [ ] Settings UI for category rules, blocklist, idle threshold
- [ ] Onboarding wizard (first-run categorisation pass)
- [ ] Single Windows installer via electron-builder (NSIS) + bundled collector
- [ ] Auto-start on login (opt-in)
- [ ] Tray with quick "pause tracking" toggle

## v1 — Ship to first paying users

- [ ] Code signing for the installer
- [ ] Crash reporter (local file only — never network)
- [ ] In-app help + keyboard shortcuts
- [ ] License-key activation (offline-verifiable)

## v2 — macOS

- [ ] macOS collector (Swift or Rust + `objc2`)
- [ ] AX permission onboarding flow
- [ ] Universal builds for the Electron shell

## v3 — Linux

- [ ] Linux collector (X11 + Wayland)
- [ ] AppImage + .deb + .rpm
