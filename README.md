# Desktop Tracker

A local-first, privacy-respecting desktop activity tracker for **Windows and Linux**. Captures every app, window, browser URL (per profile), idle period, and VSCode project automatically. Grades your days against a repeating weekly plan, and produces daily report cards, timelines, and a Sunday weekly trend report — all on your machine.

> One installer. No browser extensions. No cloud. Profile-aware.

## Status

v0. The Rust collector + Electron + SQLite + React dashboard pipeline runs end-to-end on Windows and on Linux (GNOME, Wayland or X11). Next milestones tracked in [ROADMAP.md](./ROADMAP.md).

## Architecture (one paragraph)

A small **Rust collector** (`apps/collector`) runs as a child process and emits a JSON-line heartbeat every second describing the currently focused window, the user's idle ms, and — when the foreground app is a browser — the active URL and browser profile. The Electron **main process** (`apps/desktop/src/main`) spawns the collector, sessionizes consecutive heartbeats into events, and persists them to a local **SQLite** database. The **renderer** (`apps/desktop/src/renderer`, React + Tailwind v4) reads aggregates via IPC and renders the Today / Schedule / Timeline / Weekly / Categories / Settings views. Pure TypeScript packages in `packages/` handle categorization rules, scoring, aggregation, schedule adherence, and trend analysis. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram.

## Repo layout

```
apps/
  collector/        # Rust sidecar — Win32 APIs on Windows, D-Bus/X11 on Linux
  desktop/          # Electron + React app (main, preload, renderer)
  gnome-extension/  # GNOME Shell extension — focused window under Wayland
packages/
  shared/           # TS types for events, categories, reports, schedule
  analysis/         # Pure TS: categorize, aggregate, score, schedule, trends
  defaults/         # Default app/domain category rules + title parsers
```

## The weekly schedule

The **Schedule** page holds a repeating weekly plan — "Tue 09:30–10:30 Bible study", "Mon/Tue/Wed/Fri 10:30–13:00 startup work" — and grades what you actually did against it.

- **Every block has a category.** Time inside the block only counts as *on plan* when your tracked activity lands in that category. Idle, locked and untracked time count against it too: the plan said "be doing this now", and nothing was.
- **Exactly one block per day is the ★ most important task.** This is enforced, not optional — a day with blocks always has one, and promoting a new one un-stars the old. It is weighted **double** when scoring adherence, so the thing you said mattered most actually moves the number.
- **Two ways to change a day.** Editing a block applies *every week* from now on. Or apply it to a single date — "just this Tuesday" — which records a dated exception and leaves every other week untouched. Days carrying an exception show a `revert` link to drop back to the routine.
- Blocks may not overlap, and a day in progress is only scored over the part of the plan that has already elapsed.

Today's adherence and "what should I be doing right now" appear on the **Today** page.

## Requirements

**Common**

- Node.js 20+
- Rust toolchain (`rustup`)

**Linux**

- GNOME 45+ (Wayland or X11). Other desktops work on X11 via `_NET_ACTIVE_WINDOW`.
- The bundled GNOME Shell extension, **required on Wayland** — see below.
- A C/C++ toolchain (`build-essential`, `python3`) for `better-sqlite3`.

**Windows**

- Windows 10/11
- Visual Studio Build Tools (for `better-sqlite3` native compilation)

## Quickstart — Linux

```bash
npm run setup:linux    # deps + GNOME extension + collector build
# then log out and back in (see below), and:
npm run dev
```

Or step by step:

```bash
npm install                # JS workspace deps
npm run gnome:install      # GNOME Shell extension (Wayland window tracking)
npm run collector:build    # Rust collector, release build
npm run dev                # Vite renderer + Electron main + collector
```

### Why the GNOME extension is required on Wayland

Wayland isolates clients from one another by design: there is no `_NET_ACTIVE_WINDOW` to read, and `org.gnome.Shell.Eval` is disabled outside developer mode. **Only shell-side code can see which window has focus.** The extension in `apps/gnome-extension/` exposes exactly one read-only D-Bus method returning the focused window's `wm_class`, title and pid; the collector polls it once a second. It never modifies windows and nothing leaves your machine.

GNOME Shell cannot rescan extensions in place under Wayland, so after installing you must **log out and back in**. Then verify:

```bash
gnome-extensions info desktop-tracker@nahom4.github.io    # should say ENABLED
```

Idle time (`org.gnome.Mutter.IdleMonitor`) and lock state (`org.gnome.ScreenSaver`) use stable public D-Bus interfaces and need no extension. On an **X11** session everything works without the extension via `_NET_ACTIVE_WINDOW`.

Browser URLs on Linux come from each browser's local history database (deb, Snap and Flatpak profile paths are all probed), since there is no out-of-process equivalent to Windows' UI Automation.

## Install it for real (Linux)

`npm run dev` is for hacking on it. To install the app so it lives in your
launcher and starts with your session:

```bash
npm run install:linux      # build, package, install into ~/.local
```

No root needed — a `.deb` would want sudo and an AppImage would want `libfuse2`,
so this installs per-user instead:

| What | Where |
|---|---|
| App | `~/.local/opt/desktop-tracker/` |
| Launcher | `~/.local/share/applications/desktop-tracker.desktop` |
| CLI shortcut | `~/.local/bin/desktop-tracker` |
| Login entry | `~/.config/autostart/desktop-tracker.desktop` |
| Data | `~/.config/Desktop Tracker/data.sqlite` |

The installed build is self-contained — the collector binary and the GNOME
extension ship inside it, so the repo is only needed to rebuild.

**Autostart** is written by the app itself on first launch, so the login entry
always points at the binary that actually ran. Turn it off from Settings, or:

```bash
rm ~/.config/autostart/desktop-tracker.desktop
```

It starts minimised to the tray; click the tray icon ▸ "Open dashboard". On a
desktop with no tray host the dashboard opens directly instead.

To remove it (your data is kept):

```bash
npm run uninstall:linux
```

Note that an installed build and a `npm run dev` run use **separate** databases
(`Desktop Tracker` vs `@desktop-tracker/desktop`), so development never touches
your real history.

## Quickstart — Windows

```bash
npm install
npm run collector:build
npm run dev
```

## Where the data lives

| Platform | Path |
|---|---|
| Linux   | `~/.config/@desktop-tracker/desktop/data.sqlite` (dev) |
| Windows | `%APPDATA%\@desktop-tracker\desktop\data.sqlite` (dev) |

Packaged builds use the `Desktop Tracker` app name instead.

To inspect the database, use the Python script — `better-sqlite3` is compiled against
Electron's ABI after `npm run rebuild`, so the Node inspector cannot load it:

```bash
python3 apps/desktop/scripts/inspect-db.py
```

Open the tray icon ▶ "Open dashboard" to see today's tracked activity. If your desktop has no system-tray host, the dashboard opens directly instead.

## Privacy

- All data is stored in a single local SQLite file under your OS user profile.
- Nothing is sent over the network. There is no telemetry, no auto-update phone-home, no analytics.
- Incognito / private browsing windows are detected and skipped.
- A configurable blocklist lets you exclude specific apps or domains from being recorded at all.
- The GNOME extension is read-only and answers only to your own session bus.

## License

TBD.
