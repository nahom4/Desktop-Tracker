import { contextBridge, ipcRenderer } from "electron";
import type {
  ActivityEvent,
  Category,
  CategoryPatch,
  CategoryPlan,
  CategoryRule,
  DailyReport,
  ExportRequest,
  ExportResult,
  NewCategory,
  NewCategoryRule,
  NewPlanNote,
  NewScheduleBlock,
  NewScheduleOverride,
  NotificationConfig,
  NotificationLogEntry,
  PersistedReportRef,
  PlanNote,
  ScheduleBlock,
  ScheduleBlockPatch,
  ScheduleDayAdherence,
  ScheduleNowStatus,
  ScheduleOverride,
  SchedulePlanWeek,
  ScheduleWeekAdherence,
  WeeklyReport,
} from "@desktop-tracker/shared";

export interface AiStatus {
  enabled: boolean;
  hasKey: boolean;
  running: boolean;
  lastRunAt: number | null;
  lastTagged: number;
  lastError: string | null;
}

export interface ApiKeyStatus {
  hasValue: boolean;
  preview: string;
}

export interface GithubSyncResultView {
  ok: boolean;
  message: string;
  committed?: boolean;
  pushed?: boolean;
  at: number;
}

export interface GithubSyncConfigView {
  enabled: boolean;
  repoUrl: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  hasToken: boolean;
  last: GithubSyncResultView | null;
}

const api = {
  eventsInRange: (startTs: number, endTs: number): Promise<ActivityEvent[]> =>
    ipcRenderer.invoke("events:range", startTs, endTs),

  dailyReport: (dayTs?: number): Promise<DailyReport> =>
    ipcRenderer.invoke("report:daily", dayTs),

  weeklyReport: (weekTs?: number): Promise<WeeklyReport> =>
    ipcRenderer.invoke("report:weekly", weekTs),

  rulesList: (): Promise<CategoryRule[]> => ipcRenderer.invoke("rules:list"),
  rulesCreate: (rule: NewCategoryRule): Promise<number> =>
    ipcRenderer.invoke("rules:create", rule),

  reportsHistory: (
    kind?: "daily" | "weekly",
    limit?: number
  ): Promise<PersistedReportRef[]> =>
    ipcRenderer.invoke("reports:history", kind, limit),

  reportPayload: (id: number): Promise<DailyReport | WeeklyReport | null> =>
    ipcRenderer.invoke("reports:get", id),

  exportActive: (req: ExportRequest): Promise<ExportResult> =>
    ipcRenderer.invoke("export:active", req),

  // categories
  categoriesList: (): Promise<Category[]> => ipcRenderer.invoke("categories:list"),
  categoriesCreate: (c: NewCategory): Promise<number> =>
    ipcRenderer.invoke("categories:create", c),
  categoriesUpdate: (id: number, patch: CategoryPatch): Promise<Category | null> =>
    ipcRenderer.invoke("categories:update", id, patch),
  categoriesDelete: (id: number): Promise<boolean> =>
    ipcRenderer.invoke("categories:delete", id),

  // events
  tagEvent: (eventId: number, category: string): Promise<boolean> =>
    ipcRenderer.invoke("events:tag", eventId, category),

  // settings
  /** Returns `ApiKeyStatus` for groq_api_key, raw string otherwise. */
  settingsGet: (key: string): Promise<ApiKeyStatus | string | null> =>
    ipcRenderer.invoke("settings:get", key),
  settingsSet: (key: string, value: string): Promise<boolean> =>
    ipcRenderer.invoke("settings:set", key, value),

  // AI
  aiStatus: (): Promise<AiStatus> => ipcRenderer.invoke("ai:status"),
  aiRunNow: (): Promise<{ tagged: number; reason?: string }> =>
    ipcRenderer.invoke("ai:run-now"),

  // AI Review on-demand
  reviewDailyNow: (dayTs?: number): Promise<DailyReport> =>
    ipcRenderer.invoke("review:daily-now", dayTs),
  reviewWeeklyNow: (weekTs?: number): Promise<WeeklyReport> =>
    ipcRenderer.invoke("review:weekly-now", weekTs),

  // Notifications
  notifConfigGet: (): Promise<NotificationConfig> =>
    ipcRenderer.invoke("notif:config-get"),
  notifConfigSet: (
    patch: Partial<NotificationConfig> & { smtpPassword?: string | null }
  ): Promise<NotificationConfig> =>
    ipcRenderer.invoke("notif:config-set", patch),
  notifStatus: (): Promise<{
    unproductiveMs: number;
    thresholdMs: number;
    breaches: boolean;
    breakdown: { category: string; ms: number }[];
  }> => ipcRenderer.invoke("notif:status"),
  notifCheckNow: (): Promise<NotificationLogEntry | null> =>
    ipcRenderer.invoke("notif:check-now"),
  notifTest: (): Promise<{ os: boolean; email: boolean; error?: string }> =>
    ipcRenderer.invoke("notif:test"),
  notifLog: (limit?: number): Promise<NotificationLogEntry[]> =>
    ipcRenderer.invoke("notif:log", limit),

  // Weekly schedule.
  //
  // Two ways to change a day, matching the two things a user means by "change
  // Tuesday": `scheduleBlock*` edits the recurring template (every week from
  // now on), `scheduleOverride*` records a single-date exception (this week
  // only). Everything else is read-only reporting.
  schedulePlan: (weekTs?: number): Promise<SchedulePlanWeek> =>
    ipcRenderer.invoke("schedule:plan", weekTs),
  scheduleTemplate: (): Promise<ScheduleBlock[]> =>
    ipcRenderer.invoke("schedule:template"),
  scheduleOverrides: (from?: string, to?: string): Promise<ScheduleOverride[]> =>
    ipcRenderer.invoke("schedule:overrides", from, to),

  scheduleBlockCreate: (b: NewScheduleBlock): Promise<ScheduleBlock> =>
    ipcRenderer.invoke("schedule:block-create", b),
  scheduleBlockUpdate: (
    id: number,
    patch: ScheduleBlockPatch
  ): Promise<ScheduleBlock | null> =>
    ipcRenderer.invoke("schedule:block-update", id, patch),
  scheduleBlockDelete: (id: number): Promise<boolean> =>
    ipcRenderer.invoke("schedule:block-delete", id),

  scheduleOverrideSet: (o: NewScheduleOverride): Promise<ScheduleOverride> =>
    ipcRenderer.invoke("schedule:override-set", o),
  scheduleOverrideDelete: (id: number): Promise<boolean> =>
    ipcRenderer.invoke("schedule:override-delete", id),
  scheduleOverrideClearDay: (date: string): Promise<number> =>
    ipcRenderer.invoke("schedule:override-clear-day", date),

  scheduleDayAdherence: (dayTs?: number): Promise<ScheduleDayAdherence> =>
    ipcRenderer.invoke("schedule:day-adherence", dayTs),
  scheduleWeekAdherence: (weekTs?: number): Promise<ScheduleWeekAdherence> =>
    ipcRenderer.invoke("schedule:week-adherence", weekTs),
  scheduleNow: (): Promise<ScheduleNowStatus> => ipcRenderer.invoke("schedule:now"),

  // Per-category plan notes: one Markdown document per category per day.
  // `planForCategory` also returns the previous day's entry, which the editor
  // uses to seed today's when it does not exist yet.
  planForCategory: (category: string, date?: string): Promise<CategoryPlan> =>
    ipcRenderer.invoke("plan:for-category", category, date),
  planNotes: (category?: string, limit?: number): Promise<PlanNote[]> =>
    ipcRenderer.invoke("plan:notes", category, limit),
  planNoteSave: (note: NewPlanNote): Promise<PlanNote | null> =>
    ipcRenderer.invoke("plan:note-save", note),
  planNoteDelete: (id: number): Promise<boolean> =>
    ipcRenderer.invoke("plan:note-delete", id),

  // GitHub sync
  syncConfig: (): Promise<GithubSyncConfigView> => ipcRenderer.invoke("sync:config"),
  syncNow: (): Promise<GithubSyncResultView> => ipcRenderer.invoke("sync:now"),
};

contextBridge.exposeInMainWorld("api", api);

export type TrackerApi = typeof api;
