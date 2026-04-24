use serde::Serialize;

#[derive(Serialize)]
pub struct Heartbeat<'a> {
    pub ts: i64,
    #[serde(rename = "type")]
    pub kind: &'a str,
    pub app: Option<AppInfo>,
    pub browser: Option<BrowserInfo>,
    pub idle_ms: u64,
    pub locked: bool,
}

#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub exe: String,
    pub exe_path: Option<String>,
    pub pid: u32,
    pub title: String,
}

#[derive(Serialize)]
pub struct BrowserInfo {
    pub url: String,
    pub domain: String,
    pub profile: Option<String>,
    pub incognito: bool,
}
