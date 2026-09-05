# Architecture

## High-level data flow

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                       apps/collector (Rust)                       │
 │                                                                   │
 │   ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
 │   │ window sampler │  │ idle sampler │  │   browser sampler    │ │
 │   │ win: Win32 fg  │  │ win: LastInput│ │ win: UIAutomation    │ │
 │   │ lin: Shell ext │  │ lin: Mutter   │ │ lin: history sqlite  │ │
 │   │      / X11     │  │      D-Bus    │ │      + cmdline       │ │
 │   └────────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
 │            │                 │                     │              │
 │            └────────────┬────┴─────────────────────┘              │
 │                         ▼                                          │
 │                  Heartbeat (1 Hz)                                  │
 └──────────────────────────┬───────────────────────────────────────┘
                            │  JSON line on stdout
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                  apps/desktop main process (Electron)             │
 │                                                                   │
 │   collector-bridge.ts ──▶ sessionizer.ts ──▶ db.ts (SQLite)       │
 │                                  │                                │
 │                                  ▼                                │
 │                          IPC (ipc.ts)                             │
 │                                  │                                │
 │                                  ▼                                │
 │                       scheduler.ts (cron)                         │
 │   - end-of-day daily report                                       │
 │   - Sunday weekly report                                          │
 └──────────────────────────┬───────────────────────────────────────┘
                            │ IPC
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                renderer (React + Tailwind v4)                     │
 │                                                                   │
 │  Today • Schedule • Timeline • Weekly • Reports • Categories •     │
 │  Settings                                                         │
 └──────────────────────────────────────────────────────────────────┘
```

## Why a Rust sidecar instead of native node addons?

- Native Win32 + UIAutomation work involves COM, raw pointers, and threading models that node-addon-api makes painful.
- A standalone collector binary can be unit-tested, run headless, and is trivially replaceable per platform. Linux is implemented (D-Bus + X11); a macOS binary using the AX API is still to come.
- The IPC contract is a one-line JSON object per heartbeat — language-agnostic, debuggable with `cat`.

## Heartbeat schema (collector → main)

Every second the collector prints one line to stdout:

```json
{
  "ts": 1719200000000,
  "type": "heartbeat",
  "app": {
    "exe": "Code.exe",
    "exe_path": "C:/Users/user/AppData/Local/Programs/Microsoft VS Code/Code.exe",
    "pid": 12345,
    "title": "main.rs - desktop-tracker - Visual Studio Code"
  },
  "browser": {
    "url": "https://github.com/user/repo",
    "domain": "github.com",
    "profile": "Work",
    "incognito": false
  },
  "idle_ms": 142,
  "locked": false
}
```

`browser` is `null` when the focused app is not a recognised browser. The collector never emits anything for incognito/private windows.

## Sessionization

The main process keeps an in-memory `current` session. On each heartbeat it compares (exe, title-coalesced, url, idle≥threshold) to the current session. If unchanged, it extends `end_ts`. If changed, it persists the previous session as a row in `events` and starts a new one. Idle thresholds default to 60 seconds. A heartbeat gap larger than 5 seconds also forces a session close (sleep/hibernate detection).

## Database schema

```sql
CREATE TABLE events (
  id           INTEGER PRIMARY KEY,
  start_ts     INTEGER NOT NULL,
  end_ts       INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  exe          TEXT NOT NULL,
  exe_path     TEXT,
  title        TEXT,
  url          TEXT,
  domain       TEXT,
  browser_profile TEXT,
  project      TEXT,      -- enriched by title parsers
  is_idle      INTEGER NOT NULL DEFAULT 0,
  is_locked    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_time ON events(start_ts, end_ts);

CREATE TABLE category_rules (
  id          INTEGER PRIMARY KEY,
  match_type  TEXT NOT NULL,   -- 'exe' | 'domain' | 'project' | 'title_regex'
  pattern     TEXT NOT NULL,
  category    TEXT NOT NULL,
  weight      REAL NOT NULL,   -- -1 (distracting) .. +1 (productive)
  priority    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reports (
  id        INTEGER PRIMARY KEY,
  kind      TEXT NOT NULL,     -- 'daily' | 'weekly'
  period_start INTEGER NOT NULL,
  period_end   INTEGER NOT NULL,
  payload   TEXT NOT NULL,     -- JSON
  created_at INTEGER NOT NULL
);

-- The repeating weekly plan.
CREATE TABLE schedule_blocks (
  id          INTEGER PRIMARY KEY,
  day_of_week INTEGER NOT NULL,   -- 0 = Monday .. 6 = Sunday
  start_min   INTEGER NOT NULL,   -- minutes from local midnight
  end_min     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,      -- what this time should be spent on
  is_primary  INTEGER NOT NULL DEFAULT 0,  -- the day's ★ most important task
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (end_min > start_min)
);

-- Single-date exceptions: "just this Tuesday", without touching the routine.
CREATE TABLE schedule_overrides (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL,       -- YYYY-MM-DD, local
  block_id   INTEGER,             -- template block; NULL for a one-off addition
  kind       TEXT NOT NULL,       -- 'modify' | 'remove' | 'add'
  start_min  INTEGER, end_min INTEGER, title TEXT, category TEXT,
  is_primary INTEGER, notes TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (block_id) REFERENCES schedule_blocks(id) ON DELETE CASCADE
);
-- One override per (date, block). 'add' rows have a NULL block_id, which SQLite
-- treats as distinct, so several additions per date still work.
CREATE UNIQUE INDEX idx_schedule_overrides_unique
  ON schedule_overrides(date, block_id);
```

`db.ts` maintains one invariant the UI depends on: **a day with any blocks always
has exactly one `is_primary`**. Promoting a block demotes its siblings; demoting,
deleting or moving one re-elects the day's earliest remaining block.

## Scoring

Two scores per period, both 0–100:

- **Productivity** = sum(duration × weight) over all events / max possible. Measures **what** time was spent on.
- **Focus** = function of switch rate, longest sustained block, and idle ratio. Measures **how** attention was sustained.

Implemented in `packages/analysis/src/score.ts`. Easy to tune from the Settings page.

A third score, **schedule adherence**, grades tracked activity against the weekly
plan (`packages/analysis/src/schedule.ts`):

- Each block is scored only over the part of it that has **already elapsed**, so a
  day in progress is not punished for work still in the future.
- Time inside a block counts as *on plan* only when the event's effective category
  matches the block's. Idle, locked and untracked time count against the block
  exactly like the wrong category — the plan said "be doing this now", and nothing was.
- The day score is a **duration-weighted** mean of the per-block adherences, with the
  ★ most important task weighted `DEFAULT_PRIMARY_WEIGHT_MULTIPLIER` (2×). Weighting
  by both length and importance means a short ★ still moves the number while a long
  ordinary block cannot be ignored.
- The week score is the per-day scores weighted by elapsed plan time, so days with no
  plan neither help nor hurt.

## Browser URL acquisition (the interesting bit)

Two parallel strategies, reconciled in the collector:

1. **UI Automation (primary, real-time):**
    - `GetForegroundWindow` → if the process exe is in the known browser list, enumerate the window's accessibility tree, locate the address-bar Edit element (Chromium: `name == "Address and search bar"` or similar; Firefox: `name == "Search with Google or enter address"`), read its value.
    - Result: the current URL when the user is actively viewing a tab.
2. **History file (secondary fallback, ≤30 s lag):**
    - Copy `User Data/<Profile>/History` (SQLite) to a temp dir, query `urls` for the most recent visit, emit if newer than UIA last result.

Profile resolution: read `--profile-directory=` from the process command line (via `sysinfo`), then look up the human name in `User Data/Local State` JSON (`profile.info_cache[<dir>].name`).

Incognito detection: presence of `--incognito` flag, plus the IUIAutomation `IsOffscreen` / window-class checks for the incognito icon. When detected, the collector emits no `browser` field — the URL is never recorded.

**On Linux there is no UI Automation equivalent**, so only strategy 2 runs: the
history database is the sole URL source, and the profile root is probed across deb
(`~/.config/...`), Snap (`~/snap/...`) and Flatpak (`~/.var/app/...`) layouts, since
the same browser may be installed all three ways.

## Cross-platform status

| Concern | Windows (done) | Linux (done) | macOS (planned) |
|---|---|---|---|
| Active window | `GetForegroundWindow` | GNOME Shell extension over D-Bus; X11 `_NET_ACTIVE_WINDOW` fallback | `NSWorkspace.frontmostApplication` + AX |
| App identity | `QueryFullProcessImageNameW` | `/proc/<pid>/exe`, then `comm`, then wm_class | bundle id |
| Idle | `GetLastInputInfo` | `org.gnome.Mutter.IdleMonitor`; XScreenSaver fallback | `CGEventSourceSecondsSinceLastEventType` |
| Lock | foreground-window heuristic | `org.gnome.ScreenSaver` / `org.freedesktop.ScreenSaver` | session notifications |
| Browser URL | UI Automation, history fallback | history database only | AXUIElement + AppleScript |
| Profile | `--profile-directory` cmdline | same, with deb/Snap/Flatpak roots | same |

UI, storage, and analysis are platform-agnostic and shared.

### Why a GNOME Shell extension is required on Wayland

Wayland deliberately isolates clients: a normal process cannot ask which window has
focus. There is no `_NET_ACTIVE_WINDOW` for Wayland clients, and `org.gnome.Shell.Eval`
is disabled outside developer mode (it returns `(false, '')` on GNOME 45+). Only
shell-side code can see the display.

`apps/gnome-extension/` therefore exposes a single read-only D-Bus method,
`org.gnome.Shell.Extensions.DesktopTracker.GetFocusedWindow`, returning JSON with
`wm_class`, `title`, `pid` and the sandboxed app id. The collector polls it once a
second and falls back to X11 when it is absent. This mirrors how ActivityWatch and
other trackers solve the same problem. Idle and lock state need no extension — those
are stable public interfaces on the session bus.
