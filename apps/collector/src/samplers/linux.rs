//! Linux sampling backends.
//!
//! Three sources, in order of preference:
//!
//!  * **GNOME Shell extension** (`org.gnome.Shell.Extensions.DesktopTracker`) —
//!    the only way to read the focused window under Wayland, where clients are
//!    isolated from each other by design.
//!  * **Mutter / freedesktop D-Bus** — idle time and screen-lock state. These
//!    are stable public interfaces and need no extension.
//!  * **X11** — fallback for X11 (and XWayland-only) sessions via
//!    `_NET_ACTIVE_WINDOW`.
//!
//! Every call is best-effort: a missing service returns `None` rather than
//! killing the sampling loop, and the session-bus connection is re-established
//! automatically if the bus goes away (e.g. shell restart).

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use zbus::blocking::Connection;

const SHELL_EXT_BUS: &str = "org.gnome.Shell.Extensions.DesktopTracker";
const SHELL_EXT_PATH: &str = "/org/gnome/Shell/Extensions/DesktopTracker";

/// Focused-window snapshot as reported by the GNOME Shell extension.
#[derive(Debug, Deserialize)]
struct ShellWindow {
    focused: bool,
    wm_class: Option<String>,
    title: Option<String>,
    /// -1 when the client never advertised a pid.
    pid: i64,
    sandboxed_app_id: Option<String>,
}

pub struct LinuxWindow {
    pub exe: String,
    pub exe_path: Option<String>,
    pub pid: u32,
    pub title: String,
}

// ---------------------------------------------------------------- session bus

fn session_bus() -> Option<&'static Mutex<Option<Connection>>> {
    static BUS: OnceLock<Mutex<Option<Connection>>> = OnceLock::new();
    Some(BUS.get_or_init(|| Mutex::new(Connection::session().ok())))
}

/// Call a session-bus method, reconnecting once if the cached connection died.
fn call_string(dest: &str, path: &str, iface: &str, method: &str) -> Option<String> {
    for attempt in 0..2 {
        let cell = session_bus()?;
        let mut guard = cell.lock().ok()?;
        if guard.is_none() {
            *guard = Connection::session().ok();
        }
        let conn = guard.as_ref()?;
        match conn.call_method(Some(dest), path, Some(iface), method, &()) {
            Ok(msg) => return msg.body().deserialize::<String>().ok(),
            Err(_) if attempt == 0 => {
                // Drop the (possibly stale) connection and retry once.
                *guard = None;
            }
            Err(_) => return None,
        }
    }
    None
}

fn call_u64(dest: &str, path: &str, iface: &str, method: &str) -> Option<u64> {
    let cell = session_bus()?;
    let mut guard = cell.lock().ok()?;
    if guard.is_none() {
        *guard = Connection::session().ok();
    }
    let conn = guard.as_ref()?;
    match conn.call_method(Some(dest), path, Some(iface), method, &()) {
        Ok(msg) => msg.body().deserialize::<u64>().ok(),
        Err(_) => {
            *guard = None;
            None
        }
    }
}

fn call_bool(dest: &str, path: &str, iface: &str, method: &str) -> Option<bool> {
    let cell = session_bus()?;
    let mut guard = cell.lock().ok()?;
    if guard.is_none() {
        *guard = Connection::session().ok();
    }
    let conn = guard.as_ref()?;
    match conn.call_method(Some(dest), path, Some(iface), method, &()) {
        Ok(msg) => msg.body().deserialize::<bool>().ok(),
        Err(_) => {
            *guard = None;
            None
        }
    }
}

// ------------------------------------------------------------------- window

/// True once we have warned about the missing GNOME extension, so the warning
/// does not repeat every second for the life of the process.
static WARNED_NO_EXTENSION: AtomicBool = AtomicBool::new(false);

pub fn sample_window() -> Option<LinuxWindow> {
    match shell_extension_window() {
        Some(w) => Some(w),
        None => x11_window(),
    }
}

fn shell_extension_window() -> Option<LinuxWindow> {
    let json = match call_string(
        SHELL_EXT_BUS,
        SHELL_EXT_PATH,
        SHELL_EXT_BUS,
        "GetFocusedWindow",
    ) {
        Some(j) => j,
        None => {
            if !WARNED_NO_EXTENSION.swap(true, Ordering::Relaxed) && is_wayland() {
                eprintln!(
                    "window: GNOME Shell extension not responding on {SHELL_EXT_BUS}. \
                     Under Wayland no window can be sampled without it — install it with \
                     `npm run gnome:install` and enable it, then log out and back in."
                );
            }
            return None;
        }
    };

    let snap: ShellWindow = serde_json::from_str(&json).ok()?;
    if !snap.focused {
        return None;
    }

    let pid = if snap.pid > 0 { snap.pid as u32 } else { 0 };
    let exe_path = if pid > 0 { proc_exe_path(pid) } else { None };

    // Preference order for the app identity: the real binary, then the process
    // name, then the Flatpak/Snap app id, then the class the toolkit set. If
    // none of them resolve there is nothing meaningful to attribute time to.
    let exe = exe_path
        .as_deref()
        .and_then(file_name_of)
        .or_else(|| if pid > 0 { proc_comm(pid) } else { None })
        .or_else(|| snap.sandboxed_app_id.clone())
        .or_else(|| snap.wm_class.clone())?;

    Some(LinuxWindow {
        exe: normalize_exe(&exe),
        exe_path,
        pid,
        title: snap.title.unwrap_or_default(),
    })
}

fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE")
            .map(|s| s.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
}

/// Resolve `/proc/<pid>/exe`. Fails for processes we do not own or that live in
/// another mount namespace — callers fall back to other identity sources.
fn proc_exe_path(pid: u32) -> Option<String> {
    let link = fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    let s = link.to_str()?.to_string();
    // A deleted binary (upgraded in place) reads back as "/usr/bin/foo (deleted)".
    Some(s.trim_end_matches(" (deleted)").to_string())
}

fn file_name_of(path: &str) -> Option<String> {
    Path::new(path).file_name()?.to_str().map(str::to_string)
}

fn proc_comm(pid: u32) -> Option<String> {
    let comm = fs::read_to_string(format!("/proc/{pid}/comm")).ok()?;
    let trimmed = comm.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Linux binaries have no `.exe` suffix and wm_class is often title-cased
/// ("Firefox", "Code"). Lower-case so category rules can match one spelling.
fn normalize_exe(raw: &str) -> String {
    let name = raw.rsplit('/').next().unwrap_or(raw);
    name.trim().to_ascii_lowercase()
}

// ---------------------------------------------------------------------- X11

fn x11_window() -> Option<LinuxWindow> {
    use x11rb::connection::Connection as _;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    std::env::var_os("DISPLAY")?;
    let (conn, screen_num) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen_num)?.root;

    let atom = |name: &str| -> Option<u32> {
        Some(
            conn.intern_atom(false, name.as_bytes())
                .ok()?
                .reply()
                .ok()?
                .atom,
        )
    };
    let net_active = atom("_NET_ACTIVE_WINDOW")?;
    let net_wm_name = atom("_NET_WM_NAME")?;
    let utf8_string = atom("UTF8_STRING")?;
    let net_wm_pid = atom("_NET_WM_PID")?;

    let active = conn
        .get_property(false, root, net_active, AtomEnum::WINDOW, 0, 1)
        .ok()?
        .reply()
        .ok()?;
    let win = active.value32()?.next()?;
    if win == 0 {
        return None;
    }

    let title = conn
        .get_property(false, win, net_wm_name, utf8_string, 0, 1024)
        .ok()
        .and_then(|c| c.reply().ok())
        .map(|r| String::from_utf8_lossy(&r.value).into_owned())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            conn.get_property(false, win, AtomEnum::WM_NAME, AtomEnum::STRING, 0, 1024)
                .ok()
                .and_then(|c| c.reply().ok())
                .map(|r| String::from_utf8_lossy(&r.value).into_owned())
        })
        .unwrap_or_default();

    let pid = conn
        .get_property(false, win, net_wm_pid, AtomEnum::CARDINAL, 0, 1)
        .ok()
        .and_then(|c| c.reply().ok())
        .and_then(|r| r.value32()?.next())
        .unwrap_or(0);

    // WM_CLASS is "instance\0class\0"; the instance half is closest to a binary name.
    let wm_class = conn
        .get_property(false, win, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256)
        .ok()
        .and_then(|c| c.reply().ok())
        .and_then(|r| {
            let s = String::from_utf8_lossy(&r.value).into_owned();
            s.split('\0').next().map(str::to_string)
        })
        .filter(|s| !s.is_empty());

    let exe_path = if pid > 0 { proc_exe_path(pid) } else { None };

    // Under a Wayland session the XWayland root still answers _NET_ACTIVE_WINDOW,
    // but when focus is on a native Wayland client it points at a stale or empty
    // window with no pid and no WM_CLASS. Reporting that as an app would invent
    // activity the user never had, so treat an unidentifiable window as no
    // window — which is what the GNOME extension exists to fix properly.
    let exe = exe_path.as_deref().and_then(file_name_of).or(wm_class)?;

    Some(LinuxWindow {
        exe: normalize_exe(&exe),
        exe_path,
        pid,
        title,
    })
}

// ---------------------------------------------------------------------- idle

/// Milliseconds since the last input, from Mutter's idle monitor. Mutter tracks
/// both Wayland and XWayland input, so this is accurate on either session type.
pub fn sample_idle_ms() -> u64 {
    call_u64(
        "org.gnome.Mutter.IdleMonitor",
        "/org/gnome/Mutter/IdleMonitor/Core",
        "org.gnome.Mutter.IdleMonitor",
        "GetIdletime",
    )
    .or_else(x11_idle_ms)
    .unwrap_or(0)
}

fn x11_idle_ms() -> Option<u64> {
    use x11rb::connection::Connection as _;
    use x11rb::protocol::screensaver::ConnectionExt as _;

    std::env::var_os("DISPLAY")?;
    let (conn, screen_num) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen_num)?.root;
    let info = conn.screensaver_query_info(root).ok()?.reply().ok()?;
    Some(info.ms_since_user_input as u64)
}

// ---------------------------------------------------------------------- lock

/// Whether the session is locked. GNOME's screensaver interface is the
/// authoritative source; the freedesktop one covers other desktops.
pub fn is_locked() -> bool {
    if let Some(v) = call_bool(
        "org.gnome.ScreenSaver",
        "/org/gnome/ScreenSaver",
        "org.gnome.ScreenSaver",
        "GetActive",
    ) {
        return v;
    }
    call_bool(
        "org.freedesktop.ScreenSaver",
        "/org/freedesktop/ScreenSaver",
        "org.freedesktop.ScreenSaver",
        "GetActive",
    )
    .unwrap_or(false)
}
