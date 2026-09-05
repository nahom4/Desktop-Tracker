//! Idle-time sampler. Returns milliseconds since the last keyboard or mouse
//! input system-wide using `GetLastInputInfo`.

#[cfg(windows)]
use windows::Win32::{
    System::SystemInformation::GetTickCount,
    UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
};

#[cfg(windows)]
pub fn sample_ms() -> u64 {
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii).as_bool() {
            let now = GetTickCount();
            now.wrapping_sub(lii.dwTime) as u64
        } else {
            0
        }
    }
}

#[cfg(target_os = "linux")]
pub fn sample_ms() -> u64 {
    super::linux::sample_idle_ms()
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn sample_ms() -> u64 {
    0
}
