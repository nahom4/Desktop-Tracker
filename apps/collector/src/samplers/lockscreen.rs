//! Best-effort lock-screen detection on Windows. We treat the absence of a
//! foreground window or a foreground window owned by `LockApp.exe` as locked.
//! A more reliable method using `WTSRegisterSessionNotification` will replace
//! this in v0.2.

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[cfg(windows)]
pub fn is_locked() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return true;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 {
            return true;
        }
        false
    }
}

#[cfg(target_os = "linux")]
pub fn is_locked() -> bool {
    super::linux::is_locked()
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn is_locked() -> bool {
    false
}
