//! desktop-tracker-collector
//!
//! One-second sampling loop that prints a heartbeat JSON object per line to
//! stdout. The Electron main process consumes this via a child-process pipe.

mod samplers;
mod types;

use std::io::{self, Write};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use samplers::{browser, idle, lockscreen, window};
use types::{AppInfo, Heartbeat};

const TICK: Duration = Duration::from_millis(1000);

fn main() {
    eprintln!(
        "desktop-tracker-collector v{} starting (tick={}ms)",
        env!("CARGO_PKG_VERSION"),
        TICK.as_millis()
    );

    let stdout = io::stdout();
    let mut out = stdout.lock();

    loop {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let heartbeat = match window::sample() {
            Some(win) => {
                let mut app = AppInfo {
                    exe: win.exe,
                    exe_path: win.exe_path,
                    pid: win.pid,
                    title: win.title,
                };
                let private = browser::is_private_browsing(&app);
                if private {
                    app.title = String::new();
                }
                let browser_info = if private {
                    None
                } else {
                    browser::sample(&app, win.hwnd)
                };
                Heartbeat {
                    ts: now,
                    kind: "heartbeat",
                    app: Some(app),
                    browser: browser_info,
                    idle_ms: idle::sample_ms(),
                    locked: lockscreen::is_locked(),
                }
            }
            None => Heartbeat {
                ts: now,
                kind: "heartbeat",
                app: None,
                browser: None,
                idle_ms: idle::sample_ms(),
                locked: lockscreen::is_locked(),
            },
        };

        match serde_json::to_string(&heartbeat) {
            Ok(line) => {
                if writeln!(out, "{}", line).is_err() {
                    // parent pipe closed; exit cleanly
                    break;
                }
                let _ = out.flush();
            }
            Err(e) => {
                eprintln!("serialize error: {e}");
            }
        }

        sleep(TICK);
    }
}
