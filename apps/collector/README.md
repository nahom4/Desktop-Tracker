# desktop-tracker-collector

Small Rust sidecar that samples the Windows foreground window, idle time, and
(when the foreground is a browser) URL + profile. Emits one JSON object per
second on stdout.

## Build

```bash
cd apps/collector
cargo build --release
```

Requires the GNU Rust toolchain (`rust-toolchain.toml` pins it) — no MSVC
Build Tools needed.

## Sampler status (v0.2)

| Sampler | Status |
|---|---|
| Foreground window (exe, path, pid, title) | ✅ |
| Idle ms (`GetLastInputInfo`) | ✅ |
| Lock screen detection | ✅ basic |
| Browser URL (UI Automation address bar) | ✅ Chromium + Firefox |
| Browser URL (History SQLite fallback) | ✅ |
| Browser profile (`--profile-directory` + Local State) | ✅ |
| Incognito / InPrivate / private window skip | ✅ |

## Run standalone

```bash
cargo run --release
```

Each stdout line is one heartbeat JSON object.
