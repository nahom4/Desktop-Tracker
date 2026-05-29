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
  migrateStrongRuleRetag,
  migrateSystemCategoryV1,
  migrateYoutubeAiRetag,
  purgeAiOtherTags,
  refreshDefaultCategoryHints,
  seedDefaultCategoriesIfMissing,
  seedDefaultRulesIfEmpty,
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

async function bootstrap() {
  logStartupInfo("bootstrap start");
  initDb();

  const sessionizer = new Sessionizer();

  registerIpc();

  startCollector({
    onHeartbeat: (hb) => sessionizer.onHeartbeat(hb),
    onError: (err) => console.error("[collector] error:", err),
  });

  startScheduler();
  startAiClassifier();
  void runUntilCaughtUp();

  // Start in the tray only — no window until the user opens the dashboard.
  mainWindow = createMainWindow({ showOnReady: false });
  createTray(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({ showOnReady: true });
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
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
  destroyTray();
  closeDb();
});

app.on("activate", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow({ showOnReady: true });
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
