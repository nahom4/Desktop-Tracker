import {
  categorizeAllWithTags,
  currentBlock,
  dayOfWeekFor,
  dateKeyToStartTs,
  localDateKey,
  nextBlock,
  partitionActiveIdle,
  resolveScheduleForDate,
  scoreScheduleDay,
  scoreScheduleWeek,
  startOfLocalDay,
  startOfLocalWeek,
  validateDayBlocks,
  weekDateKeys,
} from "@desktop-tracker/analysis";
import type {
  OffPlanProductive,
  ResolvedScheduleBlock,
  ScheduleDayAdherence,
  ScheduleNowStatus,
  SchedulePlanCategoryStat,
  SchedulePlanDay,
  SchedulePlanWeek,
  ScheduleWeekAdherence,
} from "@desktop-tracker/shared";
import {
  getCategoryRules,
  getEventsInRange,
  getTagsForEventIds,
  listCategories,
  listScheduleBlocks,
  listScheduleOverrides,
} from "./db";

const DAY_MS = 86_400_000;

/** Resolve the template + overrides for every day of the week containing `ts`. */
export function getWeekPlan(ts: number = Date.now()): SchedulePlanWeek {
  const weekStartTs = startOfLocalWeek(ts);
  const template = listScheduleBlocks();
  const keys = weekDateKeys(weekStartTs);
  const overrides = listScheduleOverrides(keys[0]!, keys[6]!);

  const days = keys.map<SchedulePlanDay>((date) => {
    const blocks = resolveScheduleForDate(template, overrides, date);
    return {
      date,
      dayOfWeek: dayOfWeekFor(dateKeyToStartTs(date)),
      blocks,
      errors: validateDayBlocks(
        blocks.map((b, i) => ({
          // Resolved blocks from an `add` override have no template id; use the
          // index so validation messages can still point at a specific row.
          id: b.blockId ?? -(i + 1),
          startMin: b.startMin,
          endMin: b.endMin,
          title: b.title,
          isPrimary: b.isPrimary,
        }))
      ),
    };
  });

  return {
    weekStart: localDateKey(weekStartTs),
    weekStartTs,
    days,
    template,
  };
}

/** Effective category per active event in a window — shared by the scorers. */
function categorizedActiveEvents(startTs: number, endTs: number) {
  const events = getEventsInRange(startTs, endTs);
  const { active } = partitionActiveIdle(events);
  const tags = getTagsForEventIds(active.map((e) => e.id));
  const categorized = categorizeAllWithTags(
    active,
    getCategoryRules(),
    tags,
    listCategories()
  );
  return { active, categorized };
}

export function getDayAdherence(ts: number = Date.now()): ScheduleDayAdherence {
  const dayStart = startOfLocalDay(ts);
  const date = localDateKey(dayStart);
  const template = listScheduleBlocks();
  const overrides = listScheduleOverrides(date, date);
  const resolved = resolveScheduleForDate(template, overrides, date);
  const { active, categorized } = categorizedActiveEvents(dayStart, dayStart + DAY_MS);
  const scored = scoreScheduleDay(resolved, active, categorized, Date.now());
  // scoreScheduleDay falls back to today's key when nothing is planned; make
  // sure a query for an empty past day still reports that day.
  return { ...scored, date };
}

export function getWeekAdherence(ts: number = Date.now()): ScheduleWeekAdherence {
  const weekStartTs = startOfLocalWeek(ts);
  const keys = weekDateKeys(weekStartTs);
  const template = listScheduleBlocks();
  const overrides = listScheduleOverrides(keys[0]!, keys[6]!);
  const { active, categorized } = categorizedActiveEvents(
    weekStartTs,
    weekStartTs + 7 * DAY_MS
  );
  const now = Date.now();

  const perDay = keys.map((date) => {
    const resolved = resolveScheduleForDate(template, overrides, date);
    return { ...scoreScheduleDay(resolved, active, categorized, now), date };
  });

  return scoreScheduleWeek(weekStartTs, perDay);
}

/**
 * Planned vs actual per category for today.
 *
 * Planned comes from the schedule; actual is every tracked active minute in
 * that category, whether or not it happened inside its block — the two differ,
 * and seeing both is the point: `onPlanMs` says how well you kept the plan,
 * `actualMs` says how much of the thing you actually did.
 */
function categoryStatsForDay(
  dayStart: number,
  today: ScheduleDayAdherence
): { byCategory: SchedulePlanCategoryStat[]; offPlanProductive: OffPlanProductive } {
  const { active, categorized } = categorizedActiveEvents(dayStart, dayStart + DAY_MS);

  const actualMs = new Map<string, number>();
  for (let i = 0; i < active.length; i++) {
    const cat = categorized[i]?.category;
    if (!cat) continue;
    actualMs.set(cat, (actualMs.get(cat) ?? 0) + active[i]!.durationMs);
  }

  const planned = new Map<string, { plannedMs: number; elapsedPlannedMs: number; onPlanMs: number }>();
  for (const b of today.blocks) {
    const cur = planned.get(b.block.category) ?? {
      plannedMs: 0,
      elapsedPlannedMs: 0,
      onPlanMs: 0,
    };
    cur.plannedMs += b.block.endTs - b.block.startTs;
    cur.elapsedPlannedMs += b.elapsedMs;
    cur.onPlanMs += b.onPlanMs;
    planned.set(b.block.category, cur);
  }

  const categories = listCategories();
  const colors = new Map(categories.map((c) => [c.name, c.color]));
  const weights = new Map(categories.map((c) => [c.name, c.weight]));

  // Only categories scheduled today. Time spent elsewhere is the daily
  // report's job; this card is about the day's plan.
  const byCategory = [...planned.entries()]
    .map(([category, p]) => ({
      category,
      color: colors.get(category) ?? "#64748b",
      plannedMs: p.plannedMs,
      elapsedPlannedMs: p.elapsedPlannedMs,
      onPlanMs: p.onPlanMs,
      actualMs: actualMs.get(category) ?? 0,
    }))
    .sort((a, b) => b.plannedMs - a.plannedMs);

  // Productive work the plan did not ask for. Positive category weight is what
  // makes something "productive" everywhere else in the app, so reuse it here
  // rather than inventing a second definition that can drift.
  const offPlan = [...actualMs.entries()]
    .filter(([category]) => !planned.has(category) && (weights.get(category) ?? 0) > 0)
    .map(([category, ms]) => ({
      category,
      color: colors.get(category) ?? "#64748b",
      ms,
    }))
    .sort((a, b) => b.ms - a.ms);

  return {
    byCategory,
    offPlanProductive: {
      totalMs: offPlan.reduce((sum, c) => sum + c.ms, 0),
      byCategory: offPlan,
    },
  };
}

/**
 * Per-category planned vs actual across a whole week.
 *
 * Two different numbers that the weekly email shows as two bars:
 *
 *   onPlanMs  time in the category that landed inside its scheduled blocks —
 *             "did I do it when I said I would"
 *   actualMs  every minute in that category all week, block or not — so an
 *             urgent Work stretch during a Learning block, or extra hours at
 *             the weekend, still count toward the category
 *
 * Only categories the plan asked for at some point in the week are returned;
 * time in never-scheduled categories belongs to the breakdown sections.
 */
export function getWeekCategoryStats(
  ts: number = Date.now()
): SchedulePlanCategoryStat[] {
  const weekStartTs = startOfLocalWeek(ts);
  const keys = weekDateKeys(weekStartTs);
  const template = listScheduleBlocks();
  const overrides = listScheduleOverrides(keys[0]!, keys[6]!);
  const { active, categorized } = categorizedActiveEvents(
    weekStartTs,
    weekStartTs + 7 * DAY_MS
  );
  const now = Date.now();

  const actualMs = new Map<string, number>();
  for (let i = 0; i < active.length; i++) {
    const cat = categorized[i]?.category;
    if (!cat) continue;
    actualMs.set(cat, (actualMs.get(cat) ?? 0) + active[i]!.durationMs);
  }

  const planned = new Map<
    string,
    { plannedMs: number; elapsedPlannedMs: number; onPlanMs: number }
  >();
  for (const date of keys) {
    const resolved = resolveScheduleForDate(template, overrides, date);
    const day = scoreScheduleDay(resolved, active, categorized, now);
    for (const b of day.blocks) {
      const cur = planned.get(b.block.category) ?? {
        plannedMs: 0,
        elapsedPlannedMs: 0,
        onPlanMs: 0,
      };
      cur.plannedMs += b.block.endTs - b.block.startTs;
      cur.elapsedPlannedMs += b.elapsedMs;
      cur.onPlanMs += b.onPlanMs;
      planned.set(b.block.category, cur);
    }
  }

  const colors = new Map(listCategories().map((c) => [c.name, c.color]));
  return [...planned.entries()]
    .map(([category, p]) => ({
      category,
      color: colors.get(category) ?? "#64748b",
      plannedMs: p.plannedMs,
      elapsedPlannedMs: p.elapsedPlannedMs,
      onPlanMs: p.onPlanMs,
      actualMs: actualMs.get(category) ?? 0,
    }))
    .sort((a, b) => b.plannedMs - a.plannedMs);
}

/** What the plan says the user should be doing right now, and how it is going. */
export function getScheduleNow(): ScheduleNowStatus {
  const now = Date.now();
  const today = getDayAdherence(now);
  const resolved = today.blocks.map((b) => b.block);
  const current = currentBlock(resolved, now);
  const currentEntry = current
    ? today.blocks.find(
        (b) =>
          b.block.blockId === current.blockId &&
          b.block.startMin === current.startMin
      )
    : undefined;

  return {
    now,
    current,
    next: nextBlock(resolved, now),
    currentAdherence:
      currentEntry && currentEntry.adherence !== null
        ? Math.round(currentEntry.adherence * 100)
        : null,
    today,
    ...categoryStatsForDay(startOfLocalDay(now), today),
  };
}
