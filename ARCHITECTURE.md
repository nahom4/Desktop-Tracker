# Architecture

## High-level data flow

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                       apps/collector (Rust)                       │
 │                                                                   │
 │   ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
 │   │ window sampler │  │ idle sampler │  │   browser sampler    │ │
 │   │  Win32 fg win  │  │ LastInputInfo│  │ UIAutomation + cmdline│ │
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
 │   Today  •  Timeline  •  Weekly  •  Categories  •  Settings       │
 └──────────────────────────────────────────────────────────────────┘
```

## Why a Rust sidecar instead of native node addons?

- Native Win32 + UIAutomation work involves COM, raw pointers, and threading models that node-addon-api makes painful.
- A standalone collector binary can be unit-tested, run headless, and is trivially replaceable per platform (we'll add a macOS binary using the AX API, and a Linux one using X11/Wayland in due course).
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
```

## Scoring

Two scores per period, both 0–100:

- **Productivity** = sum(duration × weight) over all events / max possible. Measures **what** time was spent on.
- **Focus** = function of switch rate, longest sustained block, and idle ratio. Measures **how** attention was sustained.

Implemented in `packages/analysis/src/score.ts`. Easy to tune from the Settings page.

## Browser URL acquisition (the interesting bit)

Two parallel strategies, reconciled in the collector:

1. **UI Automation (primary, real-time):**
    - `GetForegroundWindow` → if the process exe is in the known browser list, enumerate the window's accessibility tree, locate the address-bar Edit element (Chromium: `name == "Address and search bar"` or similar; Firefox: `name == "Search with Google or enter address"`), read its value.
    - Result: the current URL when the user is actively viewing a tab.
2. **History file (secondary fallback, ≤30 s lag):**
    - Copy `User Data/<Profile>/History` (SQLite) to a temp dir, query `urls` for the most recent visit, emit if newer than UIA last result.

Profile resolution: read `--profile-directory=` from the process command line (via `sysinfo`), then look up the human name in `User Data/Local State` JSON (`profile.info_cache[<dir>].name`).

Incognito detection: presence of `--incognito` flag, plus the IUIAutomation `IsOffscreen` / window-class checks for the incognito icon. When detected, the collector emits no `browser` field — the URL is never recorded.

## Cross-platform plan

| Concern | Windows (v1) | macOS (v2) | Linux (v3) |
|---|---|---|---|
| Active window | `GetForegroundWindow` | `NSWorkspace.frontmostApplication` + AX | X11 `_NET_ACTIVE_WINDOW` / Wayland portal |
| Idle | `GetLastInputInfo` | `CGEventSourceSecondsSinceLastEventType` | `XScreenSaverQueryInfo` / DBus idle |
| Browser URL | UI Automation | AXUIElement + AppleScript fallback | AT-SPI |
| Profile | `--profile-directory` cmdline | same | same |

UI, storage, analysis are platform-agnostic and shared.
