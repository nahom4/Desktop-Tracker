//! Browser history SQLite fallback when UI Automation cannot read the address bar.
//! Copies the locked DB to a temp file before querying (≤30 s lag).

use super::detect::BrowserKind;
use super::profile::ProfileContext;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Most recently visited URL in this profile's history database.
pub fn latest_url(ctx: &ProfileContext, kind: BrowserKind) -> Option<String> {
    let db_path = history_db_path(&ctx.profile_path, kind)?;
    let tmp = copy_to_temp(&db_path)?;
    query_latest_url(&tmp, kind)
}

fn history_db_path(profile_path: &Path, kind: BrowserKind) -> Option<PathBuf> {
    let name = if kind.is_firefox() {
        "places.sqlite"
    } else {
        "History"
    };
    let p = profile_path.join(name);
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

fn copy_to_temp(src: &Path) -> Option<PathBuf> {
    let pid = std::process::id();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    let tmp = std::env::temp_dir().join(format!(
        "desktop-tracker-history-{}-{}.sqlite",
        pid, ts
    ));
    // Retry once — the browser may briefly lock the file during a write.
    if fs::copy(src, &tmp).is_err() {
        std::thread::sleep(std::time::Duration::from_millis(50));
        fs::copy(src, &tmp).ok()?;
    }
    Some(tmp)
}

fn query_latest_url(path: &Path, kind: BrowserKind) -> Option<String> {
    let conn = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .ok()?;

    let url: String = if kind.is_firefox() {
        conn.query_row(
            "SELECT url FROM moz_places WHERE url NOT LIKE 'place:%' ORDER BY last_visit_date DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()?
    } else {
        conn.query_row(
            "SELECT url FROM urls ORDER BY last_visit_time DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()?
    };

    let _ = fs::remove_file(path);
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temp_copy_roundtrip() {
        let dir = std::env::temp_dir().join("dt-test-history");
        let _ = fs::create_dir_all(&dir);
        let src = dir.join("History");
        fs::write(&src, b"not a real sqlite").ok();
        let copied = copy_to_temp(&src);
        assert!(copied.is_some());
        let _ = fs::remove_file(copied.unwrap());
        let _ = fs::remove_file(src);
        let _ = fs::remove_dir(dir);
    }
}
