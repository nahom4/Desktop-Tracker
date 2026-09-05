import { ipcMain } from "electron";
import {
  buildDailyReport,
  buildWeeklyReport,
  localDateKey,
  startOfLocalDay,
  startOfLocalWeek,
} from "@desktop-tracker/analysis";
import {
  clearScheduleOverridesForDate,
  deleteCategory,
  deletePlanNote,
  deleteScheduleBlock,
  deleteScheduleOverride,
  deleteSetting,
  getCategoryRules,
  getEventsInRange,
  getLatestAiReviewForPeriod,
  getPlanNote,
  getPreviousPlanNote,
  getReportPayload,
  getSetting,
  getTagsForEventIds,
  insertCategory,
  insertCategoryRule,
  insertEventTags,
  insertScheduleBlock,
  listCategories,
  listNotificationLog,
  listPlanNotes,
  listReports,
  listScheduleBlocks,
  listScheduleOverrides,
  setSetting,
  updateCategory,
  updateScheduleBlock,
  upsertPlanNote,
  upsertScheduleOverride,
} from "./db";
import {
  getGithubSyncConfig,
  getLastSyncResult,
  syncToGithub,
} from "./sync-github";
import {
  getDayAdherence,
  getScheduleNow,
  getWeekAdherence,
  getWeekPlan,
} from "./schedule";
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
  CategoryPlan,
  ExportRequest,
  NewCategory,
  NewCategoryRule,
  NewPlanNote,
  NewScheduleBlock,
  NewScheduleOverride,
  NotificationConfig,
  ScheduleBlockPatch,
} from "@desktop-tracker/shared";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const KNOWN_SETTING_KEYS = new Set([
  "groq_api_key",
  "ai_tagging_enabled",
  "ai_model",
  "ai_review_model",
  "github_sync_enabled",
  "github_repo_url",
  "github_branch",
  "github_author_name",
  "github_author_email",
  "github_token",
]);

/** Settings never returned to the renderer in the clear — only as a preview. */
const SECRET_SETTING_KEYS = new Set(["groq_api_key", "github_token"]);

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
    if (SECRET_SETTING_KEYS.has(key)) {
      const v = getSetting(key);
      if (!v) return null;
      // never leak the raw secret — return only metadata
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

  // ---- weekly schedule ----
  // The template is the recurring plan; overrides are single-date exceptions.
  // "Change just this week" writes an override, "change every week" edits the
  // template — the renderer picks which call to make.
  ipcMain.handle("schedule:plan", (_e, weekTs?: number) => getWeekPlan(weekTs));
  ipcMain.handle("schedule:template", () => listScheduleBlocks());
  ipcMain.handle("schedule:overrides", (_e, from?: string, to?: string) =>
    listScheduleOverrides(from, to)
  );

  ipcMain.handle("schedule:block-create", (_e, b: NewScheduleBlock) =>
    insertScheduleBlock(normalizeBlock(b))
  );
  ipcMain.handle(
    "schedule:block-update",
    (_e, id: number, patch: ScheduleBlockPatch) =>
      updateScheduleBlock(id, normalizeBlockPatch(patch))
  );
  ipcMain.handle("schedule:block-delete", (_e, id: number) => deleteScheduleBlock(id));

  ipcMain.handle("schedule:override-set", (_e, o: NewScheduleOverride) =>
    upsertScheduleOverride(normalizeOverride(o))
  );
  ipcMain.handle("schedule:override-delete", (_e, id: number) =>
    deleteScheduleOverride(id)
  );
  ipcMain.handle("schedule:override-clear-day", (_e, date: string) =>
    clearScheduleOverridesForDate(date)
  );

  ipcMain.handle("schedule:day-adherence", (_e, dayTs?: number) =>
    getDayAdherence(dayTs)
  );
  ipcMain.handle("schedule:week-adherence", (_e, weekTs?: number) =>
    getWeekAdherence(weekTs)
  );
  ipcMain.handle("schedule:now", () => getScheduleNow());

  // ---- per-category plan notes ----
  // One Markdown document per category per day. `plan:for-category` also
  // returns the previous day's entry, which the editor uses to seed today.
  ipcMain.handle("plan:for-category", (_e, category: string, date?: string) =>
    getCategoryPlan(String(category), date)
  );
  ipcMain.handle("plan:notes", (_e, category?: string, limit?: number) =>
    listPlanNotes(category ? String(category) : undefined, limit)
  );
  ipcMain.handle("plan:note-save", (_e, note: NewPlanNote) =>
    upsertPlanNote(normalizePlanNote(note))
  );
  ipcMain.handle("plan:note-delete", (_e, id: number) => deletePlanNote(Number(id)));

  // ---- GitHub sync ----
  ipcMain.handle("sync:config", () => ({
    ...getGithubSyncConfig(),
    last: getLastSyncResult(),
  }));
  ipcMain.handle("sync:now", async () => syncToGithub({ reason: "manual" }));
}

/** One category's items plus today's note and the last one before it. */
function getCategoryPlan(category: string, date?: string): CategoryPlan {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))
    ? (date as string)
    : localDateKey(startOfLocalDay(Date.now()));
  return {
    category,
    date: day,
    today: getPlanNote(category, day),
    previous: getPreviousPlanNote(category, day),
  };
}

function normalizePlanNote(note: NewPlanNote): NewPlanNote {
  if (!note.category) throw new Error("note needs a category");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(note.date ?? ""))) {
    throw new Error(`invalid note date: ${note.date}`);
  }
  return {
    category: String(note.category),
    date: String(note.date),
    body: String(note.body ?? ""),
  };
}

/** Reject nonsense from the renderer before it reaches SQLite's CHECK clauses. */
function clampMinute(v: unknown, fallback: number, max = 1440): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, n));
}

function normalizeBlock(b: NewScheduleBlock): NewScheduleBlock {
  const startMin = clampMinute(b.startMin, 0, 1439);
  const endMin = Math.max(startMin + 1, clampMinute(b.endMin, startMin + 1));
  const title = String(b.title ?? "").trim();
  if (!title) throw new Error("schedule block needs a title");
  if (!b.category) throw new Error("schedule block needs a category");
  const day = Math.round(Number(b.dayOfWeek));
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error(`invalid dayOfWeek: ${b.dayOfWeek}`);
  }
  return {
    dayOfWeek: day as NewScheduleBlock["dayOfWeek"],
    startMin,
    endMin,
    title,
    category: String(b.category),
    isPrimary: Boolean(b.isPrimary),
    notes: b.notes ? String(b.notes) : null,
  };
}

function normalizeBlockPatch(patch: ScheduleBlockPatch): ScheduleBlockPatch {
  const out: ScheduleBlockPatch = {};
  if (patch.dayOfWeek !== undefined) {
    const day = Math.round(Number(patch.dayOfWeek));
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(`invalid dayOfWeek: ${patch.dayOfWeek}`);
    }
    out.dayOfWeek = day as ScheduleBlockPatch["dayOfWeek"];
  }
  if (patch.startMin !== undefined) out.startMin = clampMinute(patch.startMin, 0, 1439);
  if (patch.endMin !== undefined) out.endMin = clampMinute(patch.endMin, 1);
  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) throw new Error("schedule block needs a title");
    out.title = t;
  }
  if (patch.category !== undefined) out.category = String(patch.category);
  if (patch.isPrimary !== undefined) out.isPrimary = Boolean(patch.isPrimary);
  if (patch.notes !== undefined) out.notes = patch.notes ? String(patch.notes) : null;

  if (
    out.startMin !== undefined &&
    out.endMin !== undefined &&
    out.endMin <= out.startMin
  ) {
    out.endMin = out.startMin + 1;
  }
  return out;
}

function normalizeOverride(o: NewScheduleOverride): NewScheduleOverride {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.date ?? ""))) {
    throw new Error(`invalid override date: ${o.date}`);
  }
  if (o.kind !== "add" && o.kind !== "modify" && o.kind !== "remove") {
    throw new Error(`invalid override kind: ${o.kind}`);
  }
  if (o.kind !== "add" && o.blockId == null) {
    throw new Error(`${o.kind} override needs a blockId`);
  }
  const startMin = o.startMin == null ? null : clampMinute(o.startMin, 0, 1439);
  let endMin = o.endMin == null ? null : clampMinute(o.endMin, 1);
  if (startMin != null && endMin != null && endMin <= startMin) endMin = startMin + 1;

  return {
    date: o.date,
    blockId: o.kind === "add" ? null : Number(o.blockId),
    kind: o.kind,
    startMin,
    endMin,
    title: o.title ? String(o.title).trim() : null,
    category: o.category ? String(o.category) : null,
    isPrimary: o.isPrimary == null ? null : Boolean(o.isPrimary),
    notes: o.notes ? String(o.notes) : null,
  };
}

function maskKey(k: string): string {
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
