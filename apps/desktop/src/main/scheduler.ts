/**
 * Scheduler — fires three kinds of periodic work:
 *
 *  - Hourly tick (every 60 min, plus once shortly after startup):
 *      * runs the AI classifier so today's events get tagged
 *      * checks the unproductive-time threshold and notifies if breached
 *
 *  - Daily tick (23:55 local):
 *      * runs the AI classifier one more time
 *      * builds the daily report
 *      * generates the AI narrative review
 *      * persists the report (with review embedded)
 *
 *  - Weekly tick (Sunday 21:00 local):
 *      * builds the weekly report + AI narrative review
 *      * persists it
 *
 * All ticks are best-effort: a failure in one path never blocks the others.
 */

import {
  buildDailyReport,
  buildWeeklyReport,
  startOfLocalDay,
  startOfLocalWeek,
} from "@desktop-tracker/analysis";
import type { DailyReport, WeeklyReport } from "@desktop-tracker/shared";
import {
  getCategoryRules,
  getDb,
  getEventsInRange,
  getTagsForEventIds,
  listCategories,
} from "./db";
import { runUntilCaughtUp as runAiClassifier } from "./ai-classifier";
import { generateAiReview } from "./ai-review";
import { checkAndNotify } from "./notifier";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const DAILY_HOUR = 23;
const DAILY_MINUTE = 55;
const WEEKLY_DOW = 0; // Sunday
const WEEKLY_HOUR = 21;
const WEEKLY_MINUTE = 0;

let minuteTimer: NodeJS.Timeout | null = null;
let hourlyTimer: NodeJS.Timeout | null = null;
let lastDailyKey: string | null = null;
let lastWeeklyKey: string | null = null;

export function startScheduler(): void {
  if (minuteTimer) return;
  // minute tick for daily/weekly cron-style triggers
  minuteTimer = setInterval(minuteTick, 60_000);
  // hourly tick for tagging + notification check
  hourlyTimer = setInterval(() => void hourlyTick(), 60 * 60 * 1000);
  // give the app a moment to settle, then do an initial pass
  setTimeout(() => void hourlyTick(), 30_000);
  console.log("[scheduler] started — hourly tagging+notify, daily 23:55, weekly Sun 21:00");
}

export function stopScheduler(): void {
  if (minuteTimer) {
    clearInterval(minuteTimer);
    minuteTimer = null;
  }
  if (hourlyTimer) {
    clearInterval(hourlyTimer);
    hourlyTimer = null;
  }
}

function minuteTick(): void {
  const now = new Date();
  try {
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (
      now.getHours() === DAILY_HOUR &&
      now.getMinutes() === DAILY_MINUTE &&
      lastDailyKey !== dayKey
    ) {
      lastDailyKey = dayKey;
      void runDailyJob(now.getTime());
    }
    const weekKey = `${now.getFullYear()}-w${weekOfYear(now)}`;
    if (
      now.getDay() === WEEKLY_DOW &&
      now.getHours() === WEEKLY_HOUR &&
      now.getMinutes() === WEEKLY_MINUTE &&
      lastWeeklyKey !== weekKey
    ) {
      lastWeeklyKey = weekKey;
      void runWeeklyJob(now.getTime());
    }
  } catch (e) {
    console.error("[scheduler] minuteTick error", e);
  }
}

async function hourlyTick(): Promise<void> {
  console.log("[scheduler] hourly tick");
  // 1. tag
  try {
    const tagged = await runAiClassifier();
    if (tagged > 0) console.log(`[scheduler] hourly tagged ${tagged}`);
  } catch (e) {
    console.error("[scheduler] hourly tagger failed", e);
  }
  // 2. notify check
  try {
    const log = await checkAndNotify();
    if (log) console.log(`[scheduler] notification fired: ${log.title}`);
  } catch (e) {
    console.error("[scheduler] notifier failed", e);
  }
}

async function runDailyJob(nowTs: number): Promise<void> {
  console.log("[scheduler] running daily EOD job");
  // ensure the day's events are tagged before reporting
  try {
    await runAiClassifier();
  } catch (e) {
    console.error("[scheduler] daily pre-tag failed", e);
  }
  const start = startOfLocalDay(nowTs);
  const end = start + DAY_MS;
  const events = getEventsInRange(start, end);
  const rules = getCategoryRules();
  const tags = getTagsForEventIds(events.map((e) => e.id));
  const cats = listCategories();
  const report: DailyReport = buildDailyReport(events, rules, start, end, tags, cats);

  try {
    report.aiReview = await generateAiReview(report);
  } catch (e) {
    console.error("[scheduler] daily AI review failed", e);
  }

  persistReport("daily", start, end, report);
  console.log(
    `[scheduler] daily report saved (productivity=${report.productivityScore} focus=${report.focusScore} aiReview=${report.aiReview ? "yes" : "no"})`
  );

  // final notification pass with today's full data
  try {
    await checkAndNotify();
  } catch (e) {
    console.error("[scheduler] daily notifier failed", e);
  }
}

async function runWeeklyJob(nowTs: number): Promise<void> {
  console.log("[scheduler] running weekly job");
  const weekStart = startOfLocalWeek(nowTs);
  const weekEnd = weekStart + WEEK_MS;
  const events = getEventsInRange(weekStart, weekEnd);
  const prevEvents = getEventsInRange(weekStart - WEEK_MS, weekStart);
  const rules = getCategoryRules();
  const tags = getTagsForEventIds(events.map((e) => e.id));
  const cats = listCategories();
  const report: WeeklyReport = buildWeeklyReport(
    events,
    rules,
    weekStart,
    prevEvents,
    tags,
    cats
  );

  try {
    report.aiReview = await generateAiReview(report);
  } catch (e) {
    console.error("[scheduler] weekly AI review failed", e);
  }

  persistReport("weekly", weekStart, weekEnd, report);
  console.log(
    `[scheduler] weekly report saved (avgProd=${report.averageProductivityScore} avgFocus=${report.averageFocusScore} aiReview=${report.aiReview ? "yes" : "no"})`
  );
}

function persistReport(
  kind: "daily" | "weekly",
  start: number,
  end: number,
  payload: unknown
): void {
  getDb()
    .prepare(
      `INSERT INTO reports (kind, period_start, period_end, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(kind, start, end, JSON.stringify(payload), Date.now());
}

/** Build a daily report on demand for the UI's "Generate review now" button. */
export async function generateDailyReportNow(forTs: number = Date.now()): Promise<DailyReport> {
  const start = startOfLocalDay(forTs);
  const end = start + DAY_MS;
  const events = getEventsInRange(start, end);
  const rules = getCategoryRules();
  const tags = getTagsForEventIds(events.map((e) => e.id));
  const cats = listCategories();
  const report: DailyReport = buildDailyReport(events, rules, start, end, tags, cats);
  report.aiReview = await generateAiReview(report);
  persistReport("daily", start, end, report);
  return report;
}

export async function generateWeeklyReportNow(forTs: number = Date.now()): Promise<WeeklyReport> {
  const weekStart = startOfLocalWeek(forTs);
  const weekEnd = weekStart + WEEK_MS;
  const events = getEventsInRange(weekStart, weekEnd);
  const prevEvents = getEventsInRange(weekStart - WEEK_MS, weekStart);
  const rules = getCategoryRules();
  const tags = getTagsForEventIds(events.map((e) => e.id));
  const cats = listCategories();
  const report: WeeklyReport = buildWeeklyReport(
    events,
    rules,
    weekStart,
    prevEvents,
    tags,
    cats
  );
  report.aiReview = await generateAiReview(report);
  persistReport("weekly", weekStart, weekEnd, report);
  return report;
}

function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - start.getTime()) / DAY_MS;
  return Math.floor(diff / 7);
}
