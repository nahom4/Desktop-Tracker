import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  openDb,
  closeDb,
  getSetting,
  migrateAmbiguousDomainRules,
  migrateLegacyRuleCategories,
  migrateAiLegacyTagCategories,
  migrateCareerAiRetag,
  migrateClassifierV2Retag,
  migrateGeneralizedTaxonomyRulesV1,
  migrateOtherToUnclassified,
  migratePlanItemsIntoNotes,
  migrateStrongRuleRetag,
  migrateSystemCategoryV1,
  migrateYoutubeAiRetag,
  purgeAiOtherTags,
  refreshDefaultCategoryHints,
  seedDefaultCategoriesIfMissing,
  seedDefaultRulesIfEmpty,
  seedExampleScheduleIfEmpty,
  setSetting,
  upsertTaxonomyDomainRules,
} from "./db";
import { startCollector, stopCollector } from "./collector-bridge";
import { Sessionizer } from "./sessionizer";
import { registerIpc } from "./ipc";
import { createMainWindow } from "./window";
import { createTray, destroyTray } from "./tray";
import {
  generateDailyReportNow,
  startScheduler,
  stopScheduler,
} from "./scheduler";
import { startAiClassifier, stopAiClassifier, runUntilCaughtUp } from "./ai-classifier";
import { syncToGithub } from "./sync-github";

// Dev + CLI runs use the workspace package name so we hit the same SQLite
// file as `npm run dev` (not Electron's default Roaming\Electron folder).
if (!app.isPackaged) {
  app.setName("@desktop-tracker/desktop");
}

function logStartupError(label: string, error: unknown): void {
  try {
    const msg = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
    const line = `[${new Date().toISOString()}] ${label}: ${msg}\n`;
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "startup.log"), line);
  } catch {
    // Last-resort logging must never become the reason startup fails.
  }
}

function logStartupInfo(message: string): void {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "startup.log"), line);
  } catch {
    // Diagnostic logging must not affect startup.
  }
}

process.on("uncaughtException", (error) => {
  logStartupError("uncaughtException", error);
  console.error("[main] uncaughtException", error);
});

process.on("unhandledRejection", (error) => {
  logStartupError("unhandledRejection", error);
  console.error("[main] unhandledRejection", error);
});

let mainWindow: BrowserWindow | null = null;
/** Held so the session in progress can be written out on quit. */
let activeSessionizer: Sessionizer | null = null;

const REVIEW_DAILY_CLI = process.argv.includes("--review-daily-now");

// Only one tracker instance (tray app). CLI review mode is exempt.
if (!REVIEW_DAILY_CLI) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logStartupInfo("single instance lock denied; quitting");
    app.quit();
    process.exit(0);
  }
  logStartupInfo("single instance lock acquired");

  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function initDb(): string {
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, "data.sqlite");
  console.log(`[main] db: ${dbPath}`);
  openDb(dbPath);
  seedDefaultRulesIfEmpty();
  seedDefaultCategoriesIfMissing();
  seedExampleScheduleIfEmpty();
  refreshDefaultCategoryHints();
  migrateAmbiguousDomainRules();
  migrateLegacyRuleCategories();
  migrateOtherToUnclassified();
  migrateSystemCategoryV1();
  purgeAiOtherTags();
  migrateAiLegacyTagCategories();
  migrateClassifierV2Retag();
  migrateYoutubeAiRetag();
  migrateCareerAiRetag();
  migrateStrongRuleRetag();
  migrateGeneralizedTaxonomyRulesV1();
  upsertTaxonomyDomainRules();
  migratePlanItemsIntoNotes();
  // If the user exports GROQ_API_KEY once, persist it so CLI + scheduler work
  // without re-setting the env var (still overridable from Settings).
  const envGroq = process.env.GROQ_API_KEY?.trim();
  if (envGroq && !getSetting("groq_api_key")) {
    setSetting("groq_api_key", envGroq);
    console.log("[main] persisted GROQ_API_KEY from environment");
  }
  return dbPath;
}

/** Headless CLI: build today's report + Groq narrative review, print JSON, exit. */
async function runReviewDailyCli(): Promise<void> {
  initDb();
  try {
    const report = await generateDailyReportNow();
    console.log(JSON.stringify(report.aiReview, null, 2));
  } catch (e) {
    console.error(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      })
    );
    process.exitCode = 1;
  } finally {
    closeDb();
    app.quit();
  }
}

/**
 * Register the app to start at login. Only for the packaged build — dev/CLI
 * runs would otherwise register Electron's dev binary path in the user's
 * registry (Windows) or autostart directory (Linux).
 */
function syncAutoLaunch(): void {
  if (!app.isPackaged) return;
  try {
    const wanted = getSetting("launch_at_login") !== "0"; // default on
    if (process.platform === "linux") {
      syncLinuxAutoLaunch(wanted);
      return;
    }
    const current = app.getLoginItemSettings();
    if (current.openAtLogin !== wanted) {
      app.setLoginItemSettings({
        openAtLogin: wanted,
        // Start straight into the tray (no dashboard window) on boot.
        args: ["--hidden"],
      });
      logStartupInfo(`auto-launch set openAtLogin=${wanted}`);
    }
  } catch (e) {
    logStartupError("syncAutoLaunch failed", e);
  }
}

const LINUX_AUTOSTART_FILE = "desktop-tracker.desktop";

/**
 * Linux has no login-item registry: desktops start whatever `.desktop` files
 * live in the XDG autostart directory. Electron's `setLoginItemSettings` does
 * not cover this, so write the entry directly — it is the same mechanism
 * GNOME's own "Startup Applications" tool uses.
 */
function syncLinuxAutoLaunch(wanted: boolean): void {
  const autostartDir = path.join(
    process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config"),
    "autostart"
  );
  const target = path.join(autostartDir, LINUX_AUTOSTART_FILE);

  if (!wanted) {
    if (fs.existsSync(target)) {
      fs.rmSync(target);
      logStartupInfo("auto-launch entry removed");
    }
    return;
  }

  // AppImage runs from a temp mount, so the stable path is APPIMAGE when set.
  const exec = process.env.APPIMAGE || process.execPath;
  const contents = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Desktop Tracker",
    "Comment=Local-first desktop activity tracker",
    `Exec="${exec}" --hidden`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");

  if (fs.existsSync(target) && fs.readFileSync(target, "utf8") === contents) return;
  fs.mkdirSync(autostartDir, { recursive: true });
  fs.writeFileSync(target, contents, { mode: 0o644 });
  logStartupInfo(`auto-launch entry written to ${target}`);
}

async function bootstrap() {
  logStartupInfo("bootstrap start");
  initDb();
  syncAutoLaunch();

  const sessionizer = new Sessionizer();
  activeSessionizer = sessionizer;

  registerIpc();

  startCollector({
    onHeartbeat: (hb) => sessionizer.onHeartbeat(hb),
    onError: (err) => console.error("[collector] error:", err),
  });

  startScheduler();
  startAiClassifier();
  void runUntilCaughtUp();

  // Startup push, delayed so it never competes with window creation. Silent
  // when sync is off — syncToGithub reports that rather than throwing.
  setTimeout(() => {
    void syncToGithub({ reason: "startup" })
      .then((r) => console.log(`[sync] ${r.message}`))
      .catch((e) => logStartupError("github sync failed", e));
  }, 15_000);

  const openDashboard = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({ showOnReady: true });
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  // Start in the tray only — no window until the user opens the dashboard.
  mainWindow = createMainWindow({ showOnReady: false });

  // A tray icon needs a StatusNotifierItem host, which not every Linux desktop
  // provides. Without this fallback the app would start hidden with no way to
  // reach the dashboard at all.
  let hasTray = false;
  try {
    createTray(openDashboard);
    hasTray = true;
  } catch (e) {
    logStartupError("tray unavailable", e);
    console.warn("[main] no system tray available; opening the dashboard instead");
  }
  if (!hasTray && !process.argv.includes("--hidden")) openDashboard();

  logStartupInfo("bootstrap complete");
}

if (REVIEW_DAILY_CLI) {
  app.whenReady().then(runReviewDailyCli);
} else {
  app.whenReady().then(bootstrap).catch((e) => {
    logStartupError("bootstrap failed", e);
    throw e;
  });
}

app.on("window-all-closed", () => {
  // Keep running in the tray on Windows; this matches the long-running
  // tracker UX. macOS uses the same convention with the app dock.
});

app.on("before-quit", () => {
  stopAiClassifier();
  stopScheduler();
  stopCollector();
  // The session in progress only reaches SQLite when it ends. Without this the
  // stretch since the last app/title change is lost on every quit — which on a
  // long focused block is the part worth keeping.
  try {
    activeSessionizer?.flush();
  } catch (e) {
    logStartupError("final session flush failed", e);
  }
  activeSessionizer = null;
  destroyTray();
  closeDb();
});

// A tray app that lives all day is normally ended by a signal, not by a click:
// the session manager SIGTERMs it at logout or shutdown. Electron does not run
// `before-quit` for signals, so route them through app.quit() — otherwise the
// day's final session, and any pending shutdown work, is silently dropped.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    logStartupInfo(`received ${signal}; shutting down cleanly`);
    app.quit();
  });
}

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow({ showOnReady: true });
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
