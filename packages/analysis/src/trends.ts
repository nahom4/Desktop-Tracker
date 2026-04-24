import type {
  ActivityEvent,
  Category,
  CategoryHealth,
  CategoryRule,
  DailyReport,
  EventTag,
  WeeklyReport,
} from "@desktop-tracker/shared";
import {
  buildBreakdownFromCategories,
  partitionActiveIdle,
  sumDuration,
} from "./aggregate.js";
import { categorizeAllWithTags } from "./categorize.js";
import { computeProductivity } from "./productivity.js";
import { computeScores, detectStorms } from "./score.js";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** YYYY-MM-DD for a given timestamp in the local timezone. */
export function localDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of local day (00:00:00.000) for the given ts. */
export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday of the local week containing `ts` (week starts Monday). */
export function startOfLocalWeek(ts: number): number {
  const d = new Date(startOfLocalDay(ts));
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

export function buildDailyReport(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  periodStart: number,
  periodEnd: number,
  tagsByEventId: ReadonlyMap<number, EventTag[]> = new Map(),
  categories: readonly Category[] = []
): DailyReport {
  const dayEvents = events.filter(
    (e) => e.endTs > periodStart && e.startTs < periodEnd
  );
  const { active, idle } = partitionActiveIdle(dayEvents);
  const cats = categorizeAllWithTags(active, rules, tagsByEventId, categories);
  const breakdown = buildBreakdownFromCategories(active, cats);
  const targetMs = productivityTargetMs(categories, "day");

  const scoreCtx = { tagsByEventId, categories, period: "day" as const, targetMs };
  const scores = computeScores(dayEvents, rules, scoreCtx);
  const prod = computeProductivity(active, cats, categories, sumDuration(idle), {
    period: "day",
    targetMs,
  });
  const storms = detectStorms(dayEvents, rules, scoreCtx);
  const health = buildHealth(active, cats, categories, "day");

  const tips = buildReportTips(breakdown.byCategory, {
    ...scores,
    productivity: prod.score,
  });

  return {
    date: localDateKey(periodStart),
    periodStart,
    periodEnd,
    totalActiveMs: sumDuration(active),
    totalIdleMs: sumDuration(idle),
    productivityScore: prod.score,
    productivityQuality: prod.quality,
    activeRatio: prod.activeRatio,
    focusScore: scores.focus,
    breakdown,
    longestFocusBlockMs: scores.longestFocusBlockMs,
    contextSwitches: scores.contextSwitches,
    storms,
    health,
    productivityTip: tips.productivityTip,
    focusTip: tips.focusTip,
    oneChange: tips.oneChange,
  };
}

function buildHealth(
  events: readonly ActivityEvent[],
  cats: readonly { category: string }[],
  categories: readonly Category[],
  period: "day" | "week"
): CategoryHealth[] {
  const actualByName = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const name = cats[i]?.category ?? "Learning";
    actualByName.set(name, (actualByName.get(name) ?? 0) + events[i]!.durationMs);
  }
  const out: CategoryHealth[] = [];
  for (const c of categories) {
    const actualMs = actualByName.get(c.name) ?? 0;
    const targetMin =
      period === "day" ? c.targetMinPerDay : c.targetMinPerWeek;
    const targetMs = targetMin ? targetMin * 60_000 : null;
    const progress =
      targetMs && targetMs > 0
        ? Math.min(1, actualMs / targetMs)
        : null;
    out.push({
      category: c.name,
      color: c.color,
      actualMs,
      targetMs,
      progress,
      isHealthTracked: c.isHealthTracked,
    });
  }
  return out.sort((a, b) => {
    if (a.isHealthTracked !== b.isHealthTracked) return a.isHealthTracked ? -1 : 1;
    return b.actualMs - a.actualMs;
  });
}

export function buildWeeklyReport(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  weekStartTs: number,
  previousWeekEvents: readonly ActivityEvent[] = [],
  tagsByEventId: ReadonlyMap<number, EventTag[]> = new Map(),
  categories: readonly Category[] = []
): WeeklyReport {
  const weekEndTs = weekStartTs + 7 * DAY_MS;
  const weekEvents = events.filter(
    (e) => e.endTs > weekStartTs && e.startTs < weekEndTs
  );
  const { active, idle } = partitionActiveIdle(weekEvents);
  const cats = categorizeAllWithTags(active, rules, tagsByEventId, categories);
  const breakdown = buildBreakdownFromCategories(active, cats);
  const scoreCtx = {
    tagsByEventId,
    categories,
    period: "week" as const,
    targetMs: productivityTargetMs(categories, "week"),
  };
  const storms = detectStorms(weekEvents, rules, scoreCtx);
  const health = buildHealth(active, cats, categories, "week");

  const perDay: DailyReport[] = [];
  for (let i = 0; i < 7; i++) {
    const ds = weekStartTs + i * DAY_MS;
    perDay.push(
      buildDailyReport(weekEvents, rules, ds, ds + DAY_MS, tagsByEventId, categories)
    );
  }

  const validDays = perDay.filter((d) => d.totalActiveMs > 0);
  const avgProductivity =
    validDays.length > 0
      ? Math.round(validDays.reduce((s, d) => s + d.productivityScore, 0) / validDays.length)
      : 0;
  const avgFocus =
    validDays.length > 0
      ? Math.round(validDays.reduce((s, d) => s + d.focusScore, 0) / validDays.length)
      : 0;

  const prevScores = computeScores(previousWeekEvents, rules, scoreCtx);
  const productivityDelta = avgProductivity - prevScores.productivity;
  const focusDelta = avgFocus - prevScores.focus;

  // Top distractions = top buckets with category in {Social, Entertainment, Gaming}
  const distractingCats = new Set(["Social", "Entertainment", "Gaming"]);
  const topDistractions = [...breakdown.byCategory, ...breakdown.byApp, ...breakdown.byDomain]
    .filter((b) => b.category && distractingCats.has(b.category))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  const deepWorkMs = sumDeepWork(active, cats, categories);

  const weekEndDate = new Date(weekEndTs - DAY_MS);

  const tips = buildReportTips(breakdown.byCategory, {
    productivity: avgProductivity,
    focus: avgFocus,
    longestFocusBlockMs: Math.max(...perDay.map((d) => d.longestFocusBlockMs), 0),
    contextSwitches: perDay.reduce((s, d) => s + d.contextSwitches, 0),
  });

  return {
    weekStart: localDateKey(weekStartTs),
    weekEnd: localDateKey(weekEndDate.getTime()),
    totalActiveMs: sumDuration(active),
    totalIdleMs: sumDuration(idle),
    averageProductivityScore: avgProductivity,
    averageFocusScore: avgFocus,
    productivityScoreDelta: productivityDelta,
    focusScoreDelta: focusDelta,
    breakdown,
    topDistractions,
    deepWorkHours: Math.round((deepWorkMs / HOUR_MS) * 10) / 10,
    perDay,
    storms,
    health,
    oneChange: tips.oneChange,
    productivityTip: tips.productivityTip,
    focusTip: tips.focusTip,
  };
}

function productivityTargetMs(
  categories: readonly Category[],
  period: "day" | "week"
): number {
  const targetMin = categories.reduce((sum, c) => {
    if (!c.isHealthTracked) return sum;
    const target =
      period === "day" ? c.targetMinPerDay : c.targetMinPerWeek;
    return sum + Math.max(0, target ?? 0);
  }, 0);
  const fallbackMin = period === "day" ? 8 * 60 : 40 * 60;
  return (targetMin > 0 ? targetMin : fallbackMin) * 60_000;
}

function sumDeepWork(
  events: readonly ActivityEvent[],
  cats: readonly { category: string; weight?: number }[],
  categories: readonly Category[]
): number {
  const catByName = new Map(categories.map((c) => [c.name, c]));
  let total = 0;
  for (let i = 0; i < events.length; i++) {
    const cat = cats[i];
    const weight = cat?.weight ?? catByName.get(cat?.category ?? "")?.weight ?? 0;
    if (weight >= 0.8) total += events[i]!.durationMs;
  }
  return total;
}

function formatTipDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildReportTips(
  byCategory: readonly { key: string; durationMs: number }[],
  scores: {
    productivity: number;
    focus: number;
    longestFocusBlockMs: number;
    contextSwitches: number;
  }
): { productivityTip: string; focusTip: string; oneChange: string | null } {
  const block = formatTipDuration(scores.longestFocusBlockMs);
  const focusStats = `Longest block: ${block} · ${scores.contextSwitches} category switches`;

  let productivityTip: string;
  if (scores.productivity >= 85) {
    productivityTip =
      "High category quality on active time — idle still reduces the final score.";
  } else if (scores.productivity >= 60) {
    productivityTip = "Mostly productive time — keep leaning into your top categories.";
  } else if (scores.productivity < 50) {
    productivityTip =
      "Productivity is below 50. Check the breakdown for your biggest time sinks.";
  } else {
    productivityTip = "Track time on what matters most.";
  }

  let focusTip = focusStats;
  if (scores.focus >= 70) {
    focusTip = `${focusStats}. Solid sustained attention.`;
  } else if (scores.focus < 40) {
    focusTip = `${focusStats}. Too many category hops or idle stretches — stay in one lane longer.`;
  }

  let oneChange: string | null = null;
  const social = byCategory.find((b) => b.key === "Social")?.durationMs ?? 0;
  const ent = byCategory.find((b) => b.key === "Entertainment")?.durationMs ?? 0;
  if (social + ent > 2 * HOUR_MS) {
    oneChange =
      "You spent over 2 hours on Social + Entertainment. Pick the single biggest offender and block it for a day.";
  }

  return { productivityTip, focusTip, oneChange };
}
