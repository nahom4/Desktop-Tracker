//! Chrome/Edge profile resolution from process command line + Local State JSON.
//! Firefox profile resolution from profiles.ini.

use super::detect::BrowserKind;
use crate::types::AppInfo;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use sysinfo::{Pid, ProcessesToUpdate, System};

#[derive(Debug, Clone)]
pub struct ProfileContext {
    /// Absolute path to the profile folder (contains History / places.sqlite).
    pub profile_path: PathBuf,
    /// Human-readable profile label ("Work", "Personal", …).
    profile_name: Option<String>,
}

impl ProfileContext {
    pub fn resolve(app: &AppInfo, kind: BrowserKind) -> Option<ProfileContext> {
        let cmdline = process_cmd_args(app.pid);
        match kind {
            BrowserKind::Chromium => resolve_chromium(app, &cmdline),
            BrowserKind::Firefox => resolve_firefox(&cmdline),
        }
    }

    pub fn display_name(&self) -> Option<String> {
        self.profile_name.clone()
    }
}

fn resolve_chromium(app: &AppInfo, cmdline: &[String]) -> Option<ProfileContext> {
    let user_data = chromium_user_data_root(&app.exe, cmdline)?;
    let profile_dir = parse_flag_value(cmdline, "--profile-directory")
        .unwrap_or_else(|| "Default".to_string());
    let profile_path = user_data.join(&profile_dir);
    let profile_name = read_chromium_profile_name(&user_data, &profile_dir);
    Some(ProfileContext {
        profile_path,
        profile_name,
    })
}

fn resolve_firefox(cmdline: &[String]) -> Option<ProfileContext> {
    let profiles_root = firefox_profiles_root()?;
    let profile_path = if let Some(name) = parse_flag_value(cmdline, "-P") {
        find_firefox_profile_by_name(&profiles_root, &name)?
    } else if let Some(path) = parse_flag_value(cmdline, "-profile") {
        PathBuf::from(path)
    } else {
        default_firefox_profile(&profiles_root)?
    };
    let profile_name = profile_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());
    Some(ProfileContext {
        profile_path,
        profile_name,
    })
}

fn chromium_user_data_root(exe: &str, cmdline: &[String]) -> Option<PathBuf> {
    if let Some(dir) = parse_flag_value(cmdline, "--user-data-dir") {
        return Some(PathBuf::from(dir));
    }
    #[cfg(target_os = "linux")]
    {
        linux_chromium_user_data_root(exe)
    }
    #[cfg(not(target_os = "linux"))]
    {
        windows_chromium_user_data_root(exe)
    }
}

#[cfg(not(target_os = "linux"))]
fn windows_chromium_user_data_root(exe: &str) -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    let root = match exe.to_ascii_lowercase().as_str() {
        "chrome.exe" => Path::new(&local).join("Google/Chrome/User Data"),
        "msedge.exe" => Path::new(&local).join("Microsoft/Edge/User Data"),
        "brave.exe" => Path::new(&local).join("BraveSoftware/Brave-Browser/User Data"),
        "vivaldi.exe" => Path::new(&local).join("Vivaldi/User Data"),
        "opera.exe" => Path::new(&local).join("Opera Software/Opera Stable"),
        "opera_gx.exe" => Path::new(&local).join("Opera Software/Opera GX Stable"),
        "arc.exe" => Path::new(&local).join("Arc/User Data"),
        _ => return None,
    };
    Some(root)
}

/// On Linux the same browser can be installed three ways at once (deb, Snap,
/// Flatpak), each with its own profile root. Probe them in that order and take
/// the first that exists so we read the profile the running browser is using.
#[cfg(target_os = "linux")]
fn linux_chromium_user_data_root(exe: &str) -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    let candidates: &[&str] = match exe.to_ascii_lowercase().as_str() {
        "chrome" | "google-chrome" | "google-chrome-stable" | "google-chrome-beta" => &[
            ".config/google-chrome",
            ".var/app/com.google.Chrome/config/google-chrome",
        ],
        "chromium" | "chromium-browser" => &[
            ".config/chromium",
            "snap/chromium/common/chromium",
            ".var/app/org.chromium.Chromium/config/chromium",
        ],
        "brave" | "brave-browser" => &[
            ".config/BraveSoftware/Brave-Browser",
            "snap/brave/current/.config/BraveSoftware/Brave-Browser",
            ".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser",
        ],
        "microsoft-edge" | "microsoft-edge-stable" => &[
            ".config/microsoft-edge",
            ".var/app/com.microsoft.Edge/config/microsoft-edge",
        ],
        "vivaldi" | "vivaldi-bin" | "vivaldi-stable" => &[
            ".config/vivaldi",
            ".var/app/com.vivaldi.Vivaldi/config/vivaldi",
        ],
        "opera" | "opera-beta" => &[".config/opera", ".config/opera-beta"],
        _ => return None,
    };
    first_existing(&home, candidates)
}

#[cfg(target_os = "linux")]
fn firefox_profiles_root() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    first_existing(
        &home,
        &[
            ".mozilla/firefox",
            // Ubuntu ships Firefox as a Snap by default.
            "snap/firefox/common/.mozilla/firefox",
            ".var/app/org.mozilla.firefox/.mozilla/firefox",
            ".librewolf",
            ".zen",
        ],
    )
}

#[cfg(target_os = "linux")]
fn first_existing(home: &Path, relatives: &[&str]) -> Option<PathBuf> {
    relatives
        .iter()
        .map(|r| home.join(r))
        .find(|p| p.exists())
}

#[cfg(not(target_os = "linux"))]
fn firefox_profiles_root() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(Path::new(&appdata).join("Mozilla/Firefox"))
}

#[derive(Deserialize)]
struct LocalState {
    profile: Option<LocalStateProfile>,
}

#[derive(Deserialize)]
struct LocalStateProfile {
    info_cache: Option<HashMap<String, ProfileEntry>>,
}

#[derive(Deserialize)]
struct ProfileEntry {
    name: Option<String>,
}

static LOCAL_STATE_CACHE: OnceLock<Mutex<HashMap<PathBuf, (u64, HashMap<String, String>)>>> =
    OnceLock::new();

fn read_chromium_profile_name(user_data: &Path, profile_dir: &str) -> Option<String> {
    let cache = LOCAL_STATE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let local_state_path = user_data.join("Local State");
    let mtime = fs::metadata(&local_state_path).ok()?.modified().ok()?;
    let mtime_secs = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();

    {
        let guard = cache.lock().ok()?;
        if let Some((cached_mtime, map)) = guard.get(user_data) {
            if *cached_mtime == mtime_secs {
                if let Some(name) = map.get(profile_dir) {
                    return Some(name.clone());
                }
            }
        }
    }

    let text = fs::read_to_string(&local_state_path).ok()?;
    let state: LocalState = serde_json::from_str(&text).ok()?;
    let mut map = HashMap::new();
    if let Some(profile) = state.profile {
        if let Some(cache) = profile.info_cache {
            for (dir, entry) in cache {
                if let Some(name) = entry.name {
                    map.insert(dir, name);
                }
            }
        }
    }

    let name = map.get(profile_dir).cloned();
    if let Ok(mut guard) = cache.lock() {
        guard.insert(user_data.to_path_buf(), (mtime_secs, map));
    }
    name
}

fn default_firefox_profile(root: &Path) -> Option<PathBuf> {
    let ini_path = root.join("profiles.ini");
    let text = fs::read_to_string(&ini_path).ok()?;
    let mut current_path: Option<PathBuf> = None;
    let mut is_default = false;
    for line in text.lines() {
        let line = line.trim();
        if line == "[Profile0]" || line.starts_with("[Profile") {
            if is_default {
                return current_path;
            }
            current_path = None;
            is_default = line == "[Profile0]";
        } else if let Some(rest) = line.strip_prefix("Path=") {
            let p = if rest.contains(':') || rest.starts_with('/') {
                PathBuf::from(rest)
            } else {
                root.join(rest)
            };
            current_path = Some(p);
        } else if line == "Default=1" {
            is_default = true;
        }
    }
    if is_default {
        current_path
    } else {
        None
    }
}

fn find_firefox_profile_by_name(root: &Path, name: &str) -> Option<PathBuf> {
    let ini_path = root.join("profiles.ini");
    let text = fs::read_to_string(&ini_path).ok()?;
    let mut in_section = false;
    let mut section_name: Option<String> = None;
    let mut section_path: Option<PathBuf> = None;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            if in_section {
                if section_name.as_deref() == Some(name) {
                    return section_path;
                }
            }
            in_section = line.starts_with("[Profile");
            section_name = None;
            section_path = None;
        } else if in_section {
            if let Some(rest) = line.strip_prefix("Name=") {
                section_name = Some(rest.to_string());
            } else if let Some(rest) = line.strip_prefix("Path=") {
                section_path = Some(if rest.contains(':') || rest.starts_with('/') {
                    PathBuf::from(rest)
                } else {
                    root.join(rest)
                });
            }
        }
    }
    if section_name.as_deref() == Some(name) {
        section_path
    } else {
        None
    }
}

fn parse_flag_value(cmdline: &[String], flag: &str) -> Option<String> {
    let flag_eq = format!("{flag}=");
    for (i, arg) in cmdline.iter().enumerate() {
        let lower = arg.to_ascii_lowercase();
        if lower == flag.to_ascii_lowercase() {
            return cmdline.get(i + 1).cloned();
        }
        if let Some(rest) = lower.strip_prefix(&flag_eq.to_ascii_lowercase()) {
            return Some(rest.trim_matches('"').to_string());
        }
        if arg.starts_with(flag) && arg.contains('=') {
            if let Some((_, v)) = arg.split_once('=') {
                return Some(v.trim_matches('"').to_string());
            }
        }
    }
    None
}

fn process_cmd_args(pid: u32) -> Vec<String> {
    let mut system = System::new();
    let pid = Pid::from_u32(pid);
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    let Some(process) = system.process(pid) else {
        return Vec::new();
    };
    process
        .cmd()
        .iter()
        .map(|s| s.to_string_lossy().into_owned())
        .collect()
}
