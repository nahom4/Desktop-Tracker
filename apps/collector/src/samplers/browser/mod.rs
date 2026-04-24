//! Browser URL + profile sampler (v0.2).
//!
//! When the foreground app is a recognised browser:
//!   1. Detect private/incognito → skip URL (and strip page title)
//!   2. Read URL from address bar via UI Automation
//!   3. Fall back to the browser's local History SQLite (≤30 s lag)
//!   4. Resolve Chrome/Edge profile name from cmdline + Local State

mod detect;
mod history;
mod profile;
mod uia;

use crate::types::{AppInfo, BrowserInfo};
use detect::BrowserKind;
use profile::ProfileContext;

/// Returns true when the foreground browser window is private/incognito.
pub fn is_private_browsing(app: &AppInfo) -> bool {
    detect::is_private_browsing(app)
}

/// Sample browser URL + profile for the foreground window (`hwnd` from window sampler).
/// Returns `None` for non-browsers, private windows, or when no URL could be resolved.
pub fn sample(app: &AppInfo, hwnd: isize) -> Option<BrowserInfo> {
    let kind = BrowserKind::from_exe(&app.exe)?;
    if detect::is_private_browsing(app) {
        return None;
    }

    let ctx = ProfileContext::resolve(app, kind)?;
    let url = uia::read_address_bar_url(hwnd, kind)
        .or_else(|| history::latest_url(&ctx, kind))?;

    if url.is_empty() || !looks_like_url(&url) {
        return None;
    }

    let domain = extract_domain(&url).unwrap_or_default();

    Some(BrowserInfo {
        url,
        domain,
        profile: ctx.display_name(),
        incognito: false,
    })
}

fn looks_like_url(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return false;
    }
    t.starts_with("http://")
        || t.starts_with("https://")
        || t.starts_with("file://")
        || t.starts_with("chrome://")
        || t.starts_with("edge://")
        || t.starts_with("about:")
        || t.contains("://")
        || (t.contains('.') && !t.contains(' '))
}

fn extract_domain(url: &str) -> Option<String> {
    let parsed = url::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_lowercase();
    if host.is_empty() {
        return None;
    }
    if host == "localhost" {
        return Some(host);
    }
    Some(host.strip_prefix("www.").unwrap_or(&host).to_string())
}
