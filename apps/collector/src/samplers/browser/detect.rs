//! Browser identification and private/incognito detection.

use crate::types::AppInfo;
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BrowserKind {
    Chromium,
    Firefox,
}

impl BrowserKind {
    pub fn from_exe(exe: &str) -> Option<Self> {
        match exe.to_ascii_lowercase().as_str() {
            "chrome.exe" | "msedge.exe" | "brave.exe" | "vivaldi.exe" | "opera.exe"
            | "opera_gx.exe" | "arc.exe" => Some(Self::Chromium),
            "firefox.exe" | "librewolf.exe" | "zen.exe" => Some(Self::Firefox),
            _ => None,
        }
    }

    pub fn is_firefox(self) -> bool {
        matches!(self, Self::Firefox)
    }
}

/// Detect private/incognito browsing from the process command line and window title.
pub fn is_private_browsing(app: &AppInfo) -> bool {
    if private_title_hint(&app.title) {
        return true;
    }
    let cmdline = process_cmdline_lower(app.pid);
    private_cmdline_hint(&cmdline)
}

fn private_title_hint(title: &str) -> bool {
    let t = title.to_ascii_lowercase();
    t.contains("inprivate")
        || t.contains("incognito")
        || t.contains("private browsing")
        || t.contains("private window")
}

fn private_cmdline_hint(cmdline: &str) -> bool {
    cmdline.contains("--incognito")
        || cmdline.contains("--inprivate")
        || cmdline.contains("-inprivate")
        || cmdline.contains("--private-window")
        || cmdline.contains("-private-window")
        || cmdline.contains(" -private ")
        || cmdline.contains(" --private ")
}

fn process_cmdline_lower(pid: u32) -> String {
    let mut system = System::new();
    let pid = Pid::from_u32(pid);
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    let Some(process) = system.process(pid) else {
        return String::new();
    };

    // sysinfo returns cmd as Vec<String> on Windows when available.
    let cmd: Vec<String> = process
        .cmd()
        .iter()
        .map(|s| s.to_string_lossy().into_owned())
        .collect();
    if !cmd.is_empty() {
        return cmd.join(" ").to_ascii_lowercase();
    }

    // Fallback: OsString slice joined.
    process
        .cmd()
        .iter()
        .map(|s| s.to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_private_title() {
        assert!(private_title_hint("GitHub - Incognito - Google Chrome"));
        assert!(private_title_hint("InPrivate - Microsoft Edge"));
    }

    #[test]
    fn detects_private_cmdline() {
        assert!(private_cmdline_hint(
            r#"c:\chrome.exe --incognito --profile-directory=default"#
        ));
        assert!(private_cmdline_hint(
            r#"c:\msedge.exe --inprivate"#
        ));
    }
}
