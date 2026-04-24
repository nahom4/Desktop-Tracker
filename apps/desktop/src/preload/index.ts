import { contextBridge, ipcRenderer } from "electron";
import type {
  ActivityEvent,
  Category,
  CategoryPatch,
  CategoryRule,
  DailyReport,
  ExportRequest,
  ExportResult,
  NewCategory,
  NewCategoryRule,
  NotificationConfig,
  NotificationLogEntry,
  PersistedReportRef,
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
};

contextBridge.exposeInMainWorld("api", api);

export type TrackerApi = typeof api;
