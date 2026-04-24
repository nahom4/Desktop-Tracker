import { ipcMain } from "electron";
import {
  buildDailyReport,
  buildWeeklyReport,
  startOfLocalDay,
  startOfLocalWeek,
} from "@desktop-tracker/analysis";
import {
  deleteCategory,
  deleteSetting,
  getCategoryRules,
  getEventsInRange,
  getLatestAiReviewForPeriod,
  getReportPayload,
  getSetting,
  getTagsForEventIds,
  insertCategory,
  insertCategoryRule,
  insertEventTags,
  listCategories,
  listNotificationLog,
  listReports,
  setSetting,
  updateCategory,
} from "./db";
import { exportActiveWindow } from "./exports";
import { getAiStatus, runUntilCaughtUp } from "./ai-classifier";
import {
  checkAndNotify,
  computeUnproductiveToday,
  getNotificationConfig,
  sendTestNotification,
  setNotificationConfig,
} from "./notifier";
import {
  generateDailyReportNow,
  generateWeeklyReportNow,
} from "./scheduler";
import type {
  CategoryPatch,
  ExportRequest,
  NewCategory,
  NewCategoryRule,
  NotificationConfig,
} from "@desktop-tracker/shared";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const KNOWN_SETTING_KEYS = new Set([
  "groq_api_key",
  "ai_tagging_enabled",
  "ai_model",
  "ai_review_model",
]);

export function registerIpc(): void {
  ipcMain.handle("events:range", (_e, startTs: number, endTs: number) => {
    return getEventsInRange(startTs, endTs);
  });

  ipcMain.handle("report:daily", (_e, dayTs: number) => {
    const start = startOfLocalDay(dayTs ?? Date.now());
    const end = start + DAY_MS;
    const events = getEventsInRange(start, end);
    const tags = getTagsForEventIds(events.map((e) => e.id));
    const cats = listCategories();
    const report = buildDailyReport(events, getCategoryRules(), start, end, tags, cats);
    const saved = getLatestAiReviewForPeriod("daily", start);
    if (saved) report.aiReview = saved;
    return report;
  });

  ipcMain.handle("report:weekly", (_e, weekTs: number) => {
    const weekStart = startOfLocalWeek(weekTs ?? Date.now());
    const weekEnd = weekStart + WEEK_MS;
    const events = getEventsInRange(weekStart, weekEnd);
    const tags = getTagsForEventIds(events.map((e) => e.id));
    const prevStart = weekStart - WEEK_MS;
    const prevEvents = getEventsInRange(prevStart, weekStart);
    const cats = listCategories();
    const report = buildWeeklyReport(
      events,
      getCategoryRules(),
      weekStart,
      prevEvents,
      tags,
      cats
    );
    const saved = getLatestAiReviewForPeriod("weekly", weekStart);
    if (saved) report.aiReview = saved;
    return report;
  });

  ipcMain.handle("rules:list", () => getCategoryRules());
  ipcMain.handle("rules:create", (_e, rule: NewCategoryRule) =>
    insertCategoryRule(rule)
  );

  ipcMain.handle("reports:history", (_e, kind?: "daily" | "weekly", limit?: number) =>
    listReports(kind, limit)
  );

  ipcMain.handle("reports:get", (_e, id: number) => getReportPayload(id));

  ipcMain.handle("export:active", async (_e, req: ExportRequest) =>
    exportActiveWindow(req)
  );

  // ---- categories CRUD ----
  ipcMain.handle("categories:list", () => listCategories());
  ipcMain.handle("categories:create", (_e, c: NewCategory) => {
    const id = insertCategory({ ...c, isDefault: false });
    return id;
  });
  ipcMain.handle("categories:update", (_e, id: number, patch: CategoryPatch) =>
    updateCategory(id, patch)
  );
  ipcMain.handle("categories:delete", (_e, id: number) => deleteCategory(id));

  // ---- manual tag override on a single event ----
  ipcMain.handle("events:tag", (_e, eventId: number, category: string) => {
    insertEventTags([
      { eventId, category, source: "manual", confidence: 1, model: null },
    ]);
    return true;
  });

  // ---- settings (whitelisted keys only) ----
  ipcMain.handle("settings:get", (_e, key: string) => {
    if (!KNOWN_SETTING_KEYS.has(key)) return null;
    if (key === "groq_api_key") {
      const v = getSetting(key);
      if (!v) return null;
      // never leak the raw key — return only metadata
      return { hasValue: true, preview: maskKey(v) };
    }
    return getSetting(key);
  });
  ipcMain.handle("settings:set", (_e, key: string, value: string) => {
    if (!KNOWN_SETTING_KEYS.has(key)) {
      throw new Error(`unknown setting: ${key}`);
    }
    if (value === "" || value === null || value === undefined) {
      deleteSetting(key);
    } else {
      setSetting(key, String(value));
    }
    return true;
  });

  // ---- AI status / on-demand run ----
  ipcMain.handle("ai:status", () => getAiStatus());
  ipcMain.handle("ai:run-now", async () => {
    const tagged = await runUntilCaughtUp();
    return { tagged };
  });

  // ---- AI review on-demand ----
  ipcMain.handle("review:daily-now", async (_e, dayTs?: number) =>
    generateDailyReportNow(dayTs)
  );
  ipcMain.handle("review:weekly-now", async (_e, weekTs?: number) =>
    generateWeeklyReportNow(weekTs)
  );

  // ---- Notifications ----
  ipcMain.handle("notif:config-get", () => getNotificationConfig());
  ipcMain.handle(
    "notif:config-set",
    (_e, patch: Partial<NotificationConfig> & { smtpPassword?: string | null }) =>
      setNotificationConfig(patch)
  );
  ipcMain.handle("notif:status", () => computeUnproductiveToday());
  ipcMain.handle("notif:check-now", async () =>
    checkAndNotify({ force: false })
  );
  ipcMain.handle("notif:test", async () => sendTestNotification());
  ipcMain.handle("notif:log", (_e, limit?: number) =>
    listNotificationLog(limit)
  );
}

function maskKey(k: string): string {
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
