# Desktop Tracker

A local-first, privacy-respecting Windows desktop activity tracker. Captures every app, window, browser URL (per profile), idle period, and VSCode project automatically. Produces daily report cards, timelines, and a Sunday weekly trend report — all on your machine.

> One installer. No browser extensions. No cloud. Profile-aware.

## Status

v0 scaffold. The skeleton is in place and the Windows collector + Electron + SQLite + React dashboard pipeline compiles end-to-end. Next milestones tracked in [ROADMAP.md](./ROADMAP.md).

## Architecture (one paragraph)

A small **Rust collector** (`apps/collector`) runs as a child process and emits a JSON-line heartbeat every second describing the currently focused window, the user's idle ms, and — when the foreground app is a browser — the active URL and browser profile. The Electron **main process** (`apps/desktop/src/main`) spawns the collector, sessionizes consecutive heartbeats into events, and persists them to a local **SQLite** database. The **renderer** (`apps/desktop/src/renderer`, React + Tailwind v4) reads aggregates via IPC and renders the Today / Timeline / Weekly / Categories / Settings views. Pure TypeScript packages in `packages/` handle categorization rules, scoring, aggregation, and trend analysis. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram.

## Repo layout

```
apps/
  collector/    # Rust sidecar — Win32 GetForegroundWindow, GetLastInputInfo, UIAutomation
  desktop/      # Electron + React app (main, preload, renderer)
packages/
  shared/       # TS types for events, categories, reports
  analysis/     # Pure TS: categorize, aggregate, score, trends
  defaults/     # Default app/domain category rules + title parsers
```

## Requirements

- Windows 10/11
- Node.js 20+
- Rust toolchain (`rustup` + the `x86_64-pc-windows-msvc` target; comes with the default Windows install)
- A reasonably modern Visual Studio Build Tools install (for `better-sqlite3` native compilation)

## Quickstart

```bash
# 1. Install all JS workspace deps
npm install

# 2. Build the Rust collector (release build, fast at runtime)
npm run collector:build

# 3. Launch the app in dev mode (Vite renderer + Electron main + collector wired together)
npm run dev
```

The first run creates `%APPDATA%/desktop-tracker/data.sqlite`. Open the tray icon ▶ "Open dashboard" to see today's tracked activity.

## Privacy

- All data is stored in a single local SQLite file under your OS user profile.
- Nothing is sent over the network. There is no telemetry, no auto-update phone-home, no analytics.
- Incognito / private browsing windows are detected and skipped.
- A configurable blocklist lets you exclude specific apps or domains from being recorded at all.

## License

TBD.
