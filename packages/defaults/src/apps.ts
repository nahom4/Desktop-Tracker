import type { NewCategoryRule } from "@desktop-tracker/shared";

/**
 * Default exe → category rules. Lowercase pattern matched case-insensitively
 * against the bare exe filename (no path, with .exe).
 *
 * weight: +1 = deep work, +0.5 = work-adjacent, 0 = neutral, -0.5 = leisure,
 *         -1 = distraction.
 */
export const DEFAULT_APP_RULES: NewCategoryRule[] = [
  // IDEs / editors
  { matchType: "exe", pattern: "code.exe",          category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "cursor.exe",        category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "code - insiders.exe", category: "Work",        weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "windsurf.exe",      category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "devenv.exe",        category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "idea64.exe",        category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "pycharm64.exe",     category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "webstorm64.exe",    category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "goland64.exe",      category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "rustrover64.exe",   category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "clion64.exe",       category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "rider64.exe",       category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "androidstudio64.exe", category: "Work",        weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "sublime_text.exe",  category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "nvim-qt.exe",       category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "neovide.exe",       category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "codex.exe",         category: "Work",          weight: 1.0,  priority: 10 },

  // Terminal / shell
  { matchType: "exe", pattern: "windowsterminal.exe", category: "Work",        weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "wt.exe",            category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "powershell.exe",    category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "pwsh.exe",          category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "cmd.exe",           category: "Work",          weight: 0.5,  priority: 9 },
  { matchType: "exe", pattern: "bash.exe",          category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "alacritty.exe",     category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "wezterm-gui.exe",   category: "Work",          weight: 1.0,  priority: 9 },

  // Dev tools
  { matchType: "exe", pattern: "docker desktop.exe", category: "Work",         weight: 0.5,  priority: 8 },
  { matchType: "exe", pattern: "postman.exe",       category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "insomnia.exe",      category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "tableplus.exe",     category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "dbeaver.exe",       category: "Work",          weight: 0.8,  priority: 8 },

  // Docs / office
  { matchType: "exe", pattern: "obsidian.exe",      category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "notion.exe",        category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "winword.exe",       category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "excel.exe",         category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "powerpnt.exe",      category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "onenote.exe",       category: "Work",          weight: 0.5,  priority: 8 },

  // Design
  { matchType: "exe", pattern: "figma.exe",         category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "photoshop.exe",     category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "illustrator.exe",   category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "blender.exe",       category: "Work",          weight: 0.8,  priority: 8 },

  // Communication
  { matchType: "exe", pattern: "slack.exe",         category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "discord.exe",       category: "Social",        weight: -0.2, priority: 7 },
  { matchType: "exe", pattern: "teams.exe",         category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "ms-teams.exe",      category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "outlook.exe",       category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "thunderbird.exe",   category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "telegram.exe",      category: "Social",        weight: -0.3, priority: 7 },
  { matchType: "exe", pattern: "whatsapp.exe",      category: "Social",        weight: -0.3, priority: 7 },

  // Meetings
  { matchType: "exe", pattern: "zoom.exe",          category: "Work",          weight: 0.3,  priority: 7 },
  { matchType: "exe", pattern: "googlemeet.exe",    category: "Work",          weight: 0.3,  priority: 7 },

  // Entertainment
  { matchType: "exe", pattern: "spotify.exe",       category: "Entertainment", weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "vlc.exe",           category: "Entertainment", weight: -0.5, priority: 6 },
  { matchType: "exe", pattern: "netflix.exe",       category: "Entertainment", weight: -1.0, priority: 6 },

  // Gaming
  { matchType: "exe", pattern: "steam.exe",         category: "Entertainment", weight: -1.0, priority: 6 },
  { matchType: "exe", pattern: "epicgameslauncher.exe", category: "Entertainment", weight: -1.0, priority: 6 },
  { matchType: "exe", pattern: "battle.net.exe",    category: "Entertainment", weight: -1.0, priority: 6 },
  { matchType: "exe", pattern: "leagueclient.exe",  category: "Entertainment", weight: -1.0, priority: 6 },

  // System
  { matchType: "exe", pattern: "explorer.exe",      category: "System",        weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "systemsettings.exe", category: "System",       weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "taskmgr.exe",       category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "applicationframehost.exe", category: "System", weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "startmenuexperiencehost.exe", category: "System", weight: 0.0, priority: 8 },
  { matchType: "exe", pattern: "searchhost.exe",    category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "textinputhost.exe", category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "runtimebroker.exe", category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "snippingtool.exe",  category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "shellexperiencehost.exe", category: "System",  weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "shellhost.exe",     category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "notepad.exe",       category: "Work",          weight: 0.3,  priority: 6 },
  { matchType: "title_regex", pattern: "(credentials|\\.env|\\.ini|\\.json|config|settings) - Notepad", category: "System", weight: 0.0, priority: 20 },
  { matchType: "title_regex", pattern: "^Desktop Tracker$", category: "System", weight: 0.0, priority: 20 },
  { matchType: "title_regex", pattern: "^(New Tab|Untitled)( - (Google Chrome|Microsoft Edge|Brave|Firefox))?$", category: "System", weight: 0.0, priority: 20 },

  // Intent-based mixed-site title rules. These keep YouTube/Reddit/LinkedIn
  // flexible while still classifying obvious everyday cases without AI.
  { matchType: "title_regex", pattern: "(course|tutorial|lesson|lecture|walkthrough|explained|documentation|docs|learn|study|bootcamp|certification|HackerRank|LeetCode|programming|coding|developer|software engineer|React|Next\\.js|Node\\.js|Python|Rust|TypeScript|JavaScript|OpenAI|Codex|ChatGPT|Claude|Midjourney|LLM|\\bAI\\b).+(YouTube|Reddit|LinkedIn)", category: "Learning", weight: 0.9, priority: 12 },
  { matchType: "title_regex", pattern: "(official trailer|trailer|teaser|movie|film|series|episode|comedy|stand.?up|music video|highlights|podcast|reaction|recap|Marvel|DC|Spider-Man|Netflix).+(YouTube|Reddit)", category: "Entertainment", weight: -0.5, priority: 12 },
  { matchType: "title_regex", pattern: "(jobs?|careers?|hiring|recruiter|interview|resume|CV|portfolio|salary|compensation).+(LinkedIn|Indeed|Glassdoor|Greenhouse|Lever|Workday)", category: "Career", weight: 1.0, priority: 12 },

  // Having the editor focused is not the same as writing code. A markdown file
  // open in it is reading — notes, docs, a lesson — so the file in the title
  // decides, not the binary. Priority beats the editor `exe` rules below.
  //
  // Subject first, then the generic fallback. A VS Code title carries both the
  // file and its folder ("resume.md - job-hunt - Visual Studio Code"), so the
  // topic is usually right there; only when nothing matches does markdown mean
  // "learning" by default. Ordering here is by priority, not position: the
  // engine takes the highest-priority match, so these 16s beat the 14 below.
  { matchType: "title_regex", pattern: "^(?=.*\\.mdx?\\b)(?=.*(resum[eé]|\\bcv\\b|cover.?letter|interview|hiring|recruit|job.?(hunt|search|app)|offer.?letter|salary|negotiat|portfolio|linkedin|career)).* - (Visual Studio Code|Cursor|VSCodium|Code - OSS)$", category: "Career", weight: 1.0, priority: 16 },
  { matchType: "title_regex", pattern: "^(?=.*\\.mdx?\\b)(?=.*(bible|scripture|devotion|sermon|prayer|theolog|church|gospel|psalm|faith)).* - (Visual Studio Code|Cursor|VSCodium|Code - OSS)$", category: "Religion", weight: 1.0, priority: 16 },
  { matchType: "title_regex", pattern: "^(?=.*\\.mdx?\\b)(?=.*(business|startup|pitch|investor|revenue|pricing|competitor|market.?(research|fit)|go.?to.?market|monetiz|\\bsaas\\b)).* - (Visual Studio Code|Cursor|VSCodium|Code - OSS)$", category: "Business", weight: 1.0, priority: 16 },
  // Project docs written *for* the thing you are building are work, not study.
  { matchType: "title_regex", pattern: "(readme|changelog|contributing|architecture|\\badr\\b|\\brfc\\b|spec|design.?doc|runbook|postmortem|release.?notes|roadmap|todo)\\.mdx?\\b.* - (Visual Studio Code|Cursor|VSCodium|Code - OSS)$", category: "Work", weight: 1.0, priority: 16 },
  // Everything else in markdown: reading and note-taking.
  { matchType: "title_regex", pattern: "\\.mdx?\\b.* - (Visual Studio Code|Cursor|VSCodium|Code - OSS)$", category: "Learning", weight: 0.9, priority: 14 },

  // ---- Linux ----
  // Binaries carry no ".exe", so these are separate patterns rather than
  // variants of the rules above. The collector lower-cases the binary name
  // before matching, so "Code" and "code" both land here.

  // IDEs / editors
  { matchType: "exe", pattern: "code",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "code-insiders",     category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "cursor",            category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "windsurf",          category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "codium",            category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "idea",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "pycharm",           category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "webstorm",          category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "goland",            category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "rustrover",         category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "clion",             category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "rider",             category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "studio",            category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "subl",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "sublime_text",      category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "nvim",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "neovide",           category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "exe", pattern: "gedit",             category: "Work",          weight: 0.5,  priority: 9 },

  // Terminal / shell — on Linux the terminal emulator is the focused window,
  // whatever is running inside it.
  { matchType: "exe", pattern: "gnome-terminal-server", category: "Work",      weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "kgx",               category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "konsole",           category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "alacritty",         category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "kitty",             category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "wezterm-gui",       category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "ghostty",           category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "xterm",             category: "Work",          weight: 1.0,  priority: 9 },
  { matchType: "exe", pattern: "tilix",             category: "Work",          weight: 1.0,  priority: 9 },

  // Dev tools
  { matchType: "exe", pattern: "postman",           category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "insomnia",          category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "dbeaver",           category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "beekeeper-studio",  category: "Work",          weight: 0.8,  priority: 8 },

  // Docs / office
  { matchType: "exe", pattern: "obsidian",          category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "notion-app",        category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "soffice",           category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "soffice.bin",       category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "libreoffice",       category: "Work",          weight: 0.7,  priority: 8 },
  { matchType: "exe", pattern: "evince",            category: "Work",          weight: 0.5,  priority: 8 },
  { matchType: "exe", pattern: "okular",            category: "Work",          weight: 0.5,  priority: 8 },

  // Design
  { matchType: "exe", pattern: "gimp",              category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "inkscape",          category: "Work",          weight: 0.8,  priority: 8 },
  { matchType: "exe", pattern: "blender",           category: "Work",          weight: 0.8,  priority: 8 },

  // Communication
  { matchType: "exe", pattern: "slack",             category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "discord",           category: "Social",        weight: -0.2, priority: 7 },
  { matchType: "exe", pattern: "teams-for-linux",   category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "thunderbird",       category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "evolution",         category: "Work",          weight: 0.0,  priority: 7 },
  { matchType: "exe", pattern: "telegram-desktop",  category: "Social",        weight: -0.3, priority: 7 },
  { matchType: "exe", pattern: "signal-desktop",    category: "Social",        weight: -0.3, priority: 7 },

  // Meetings
  { matchType: "exe", pattern: "zoom",              category: "Work",          weight: 0.3,  priority: 7 },

  // Entertainment
  { matchType: "exe", pattern: "spotify",           category: "Entertainment", weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "vlc",               category: "Entertainment", weight: -0.5, priority: 6 },
  { matchType: "exe", pattern: "mpv",               category: "Entertainment", weight: -0.5, priority: 6 },
  { matchType: "exe", pattern: "totem",             category: "Entertainment", weight: -0.5, priority: 6 },

  // Gaming
  { matchType: "exe", pattern: "steam",             category: "Entertainment", weight: -1.0, priority: 6 },
  { matchType: "exe", pattern: "lutris",            category: "Entertainment", weight: -1.0, priority: 6 },
  { matchType: "exe", pattern: "heroic",            category: "Entertainment", weight: -1.0, priority: 6 },

  // System / desktop shell
  { matchType: "exe", pattern: "nautilus",          category: "System",        weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "dolphin",           category: "System",        weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "thunar",            category: "System",        weight: 0.0,  priority: 6 },
  { matchType: "exe", pattern: "gnome-control-center", category: "System",     weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "gnome-system-monitor", category: "System",     weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "gnome-shell",       category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "gnome-software",    category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "gnome-screenshot",  category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "gnome-calculator",  category: "System",        weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "xdg-desktop-portal-gnome", category: "System",  weight: 0.0,  priority: 8 },
  { matchType: "exe", pattern: "electron",          category: "System",        weight: 0.0,  priority: 5 },
];

/**
 * Lookup helper: lowercased exe set of all known browsers (used to gate URL
 * extraction). Keep in sync with `BrowserKind::from_exe` in the collector.
 */
export const BROWSER_EXES: ReadonlySet<string> = new Set([
  // Windows
  "chrome.exe",
  "msedge.exe",
  "brave.exe",
  "vivaldi.exe",
  "opera.exe",
  "opera_gx.exe",
  "arc.exe",
  "firefox.exe",
  "librewolf.exe",
  "zen.exe",
  // Linux
  "chrome",
  "google-chrome",
  "google-chrome-stable",
  "google-chrome-beta",
  "chromium",
  "chromium-browser",
  "brave",
  "brave-browser",
  "microsoft-edge",
  "microsoft-edge-stable",
  "vivaldi",
  "vivaldi-bin",
  "vivaldi-stable",
  "opera",
  "opera-beta",
  "firefox",
  "firefox-bin",
  "firefox-esr",
  "librewolf",
  "zen",
  "zen-bin",
  "waterfox",
]);
