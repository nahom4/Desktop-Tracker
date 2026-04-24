//! Foreground-window sampler. Returns the exe name + path, PID, and window
//! title of whatever window currently has focus.

use std::path::Path;

#[cfg(windows)]
use windows::Win32::{
    Foundation::{CloseHandle, HWND},
    System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    },
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    },
};

#[cfg(windows)]
use windows::core::PWSTR;

pub struct WindowInfo {
    pub hwnd: isize,
    pub exe: String,
    pub exe_path: Option<String>,
    pub pid: u32,
    pub title: String,
}

#[cfg(windows)]
pub fn sample() -> Option<WindowInfo> {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        // Title
        let title_len = GetWindowTextLengthW(hwnd);
        let title = if title_len > 0 {
            let mut buf = vec![0u16; (title_len as usize) + 1];
            let copied = GetWindowTextW(hwnd, &mut buf) as usize;
            String::from_utf16_lossy(&buf[..copied])
        } else {
            String::new()
        };

        // Process
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 {
            return None;
        }

        let exe_path = process_exe_path(pid);
        let exe = exe_path
            .as_deref()
            .and_then(|p| Path::new(p).file_name())
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unknown.exe".to_string());

        Some(WindowInfo {
            hwnd: hwnd.0 as isize,
            exe,
            exe_path,
            pid,
            title,
        })
    }
}

#[cfg(windows)]
unsafe fn process_exe_path(pid: u32) -> Option<String> {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    if handle.is_invalid() {
        return None;
    }

    let mut buf = vec![0u16; 1024];
    let mut size: u32 = buf.len() as u32;
    let result = QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_FORMAT(0),
        PWSTR(buf.as_mut_ptr()),
        &mut size as *mut u32,
    );
    let _ = CloseHandle(handle);

    if result.is_err() || size == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buf[..size as usize]))
}

#[cfg(not(windows))]
pub fn sample() -> Option<WindowInfo> {
    None
}
