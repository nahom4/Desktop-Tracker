import type {
  ActivityEvent,
  BlockAdherence,
  CategorizedEvent,
  DayOfWeek,
  ResolvedScheduleBlock,
  ScheduleBlock,
  ScheduleDayAdherence,
  ScheduleOverride,
  ScheduleValidationError,
  ScheduleWeekAdherence,
} from "@desktop-tracker/shared";
import { DEFAULT_PRIMARY_WEIGHT_MULTIPLIER } from "@desktop-tracker/shared";
import { localDateKey, startOfLocalDay } from "./trends.js";

const DAY_MS = 86_400_000;

/** 0 = Monday … 6 = Sunday. `Date.getDay()` is Sunday-based, so it is rotated. */
export function dayOfWeekFor(ts: number): DayOfWeek {
  const js = new Date(ts).getDay();
  return ((js + 6) % 7) as DayOfWeek;
}

/** Parse a YYYY-MM-DD key into local midnight on that date. */
export function dateKeyToStartTs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}

/**
 * Absolute timestamp for `startMin` minutes past local midnight on `date`.
 *
 * Built by mutating a local Date rather than adding milliseconds to midnight,
 * so a block stays at its wall-clock time across a DST transition instead of
 * sliding by an hour.
 */
export function minuteOfDayToTs(date: string, minute: number): number {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  dt.setMinutes(minute);
  return dt.getTime();
}

/** "09:30", "13:05" — 24-hour, zero-padded. */
export function formatMinuteOfDay(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Parse "9:30", "09:30", "9:30 PM", "2 PM" → minutes from midnight, or null. */
export function parseMinuteOfDay(input: string): number | null {
  const raw = input.trim().toLowerCase();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * Merge the weekly template with any overrides recorded for `date`, producing
 * the blocks that actually apply that day, sorted by start time.
 */
export function resolveScheduleForDate(
  blocks: readonly ScheduleBlock[],
  overrides: readonly ScheduleOverride[],
  date: string
): ResolvedScheduleBlock[] {
  const dow = dayOfWeekFor(dateKeyToStartTs(date));
  const forDate = overrides.filter((o) => o.date === date);

  const removed = new Set(
    forDate.filter((o) => o.kind === "remove" && o.blockId != null).map((o) => o.blockId!)
  );
  const modified = new Map(
    forDate
      .filter((o) => o.kind === "modify" && o.blockId != null)
      .map((o) => [o.blockId!, o] as const)
  );

  const out: ResolvedScheduleBlock[] = [];

  for (const b of blocks) {
    if (b.dayOfWeek !== dow) continue;
    if (removed.has(b.id)) continue;
    const patch = modified.get(b.id);
    const startMin = patch?.startMin ?? b.startMin;
    const endMin = patch?.endMin ?? b.endMin;
    out.push({
      blockId: b.id,
      overrideId: patch?.id ?? null,
      date,
      dayOfWeek: b.dayOfWeek,
      startMin,
      endMin,
      startTs: minuteOfDayToTs(date, startMin),
      endTs: minuteOfDayToTs(date, endMin),
      title: patch?.title ?? b.title,
      category: patch?.category ?? b.category,
      isPrimary: patch?.isPrimary ?? b.isPrimary,
      notes: patch?.notes ?? b.notes,
      isOverridden: patch != null,
    });
  }

  for (const o of forDate) {
    if (o.kind !== "add") continue;
    const startMin = o.startMin ?? 0;
    const endMin = o.endMin ?? 0;
    out.push({
      blockId: null,
      overrideId: o.id,
      date,
      dayOfWeek: dow,
      startMin,
      endMin,
      startTs: minuteOfDayToTs(date, startMin),
      endTs: minuteOfDayToTs(date, endMin),
      title: o.title ?? "(untitled)",
      category: o.category ?? "Unclassified",
      isPrimary: o.isPrimary ?? false,
      notes: o.notes,
      isOverridden: true,
    });
  }

  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/**
 * Rules a single day's plan must satisfy. The most-important-task rule is the
 * one the user asked to be mandatory: any day with blocks needs exactly one.
 */
export function validateDayBlocks(
  blocks: readonly Pick<
    ScheduleBlock,
    "id" | "startMin" | "endMin" | "title" | "isPrimary"
  >[]
): ScheduleValidationError[] {
  const errors: ScheduleValidationError[] = [];
  if (blocks.length === 0) return errors;

  for (const b of blocks) {
    if (b.endMin <= b.startMin) {
      errors.push({
        code: "bad-range",
        message: `"${b.title || "Untitled"}" ends at or before it starts.`,
        blockIds: [b.id],
      });
    }
    if (!b.title.trim()) {
      errors.push({
        code: "empty-title",
        message: "Every block needs a title.",
        blockIds: [b.id],
      });
    }
  }

  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.startMin < prev.endMin) {
      errors.push({
        code: "overlap",
        message: `"${prev.title}" (${formatMinuteOfDay(prev.startMin)}–${formatMinuteOfDay(
          prev.endMin
        )}) overlaps "${cur.title}" (${formatMinuteOfDay(cur.startMin)}–${formatMinuteOfDay(
          cur.endMin
        )}).`,
        blockIds: [prev.id, cur.id],
      });
    }
  }

  const primaries = blocks.filter((b) => b.isPrimary);
  if (primaries.length === 0) {
    errors.push({
      code: "no-primary",
      message: "Mark one block as the day's most important task.",
      blockIds: [],
    });
  } else if (primaries.length > 1) {
    errors.push({
      code: "multiple-primary",
      message: "Only one block per day can be the most important task.",
      blockIds: primaries.map((b) => b.id),
    });
  }

  return errors;
}

function overlapMs(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Grade a day's plan against what was actually tracked.
 *
 * A block is scored only over the part of it that has already elapsed, so a
 * day in progress is not punished for work that is still in the future. Time
 * inside a block that was idle, locked, or untracked counts against the block
 * the same way as time on the wrong category — the plan said "be doing this
 * now", and nothing was.
 *
 * The day score is a duration-weighted mean of the per-block adherences, with
 * the most important task multiplied by
 * {@link DEFAULT_PRIMARY_WEIGHT_MULTIPLIER}. Weighting by both length and
 * importance means a short MIT still moves the number, while a long ordinary
 * block cannot be ignored.
 */
export function scoreScheduleDay(
  resolved: readonly ResolvedScheduleBlock[],
  activeEvents: readonly ActivityEvent[],
  categorized: readonly CategorizedEvent[],
  now: number = Date.now(),
  primaryMultiplier: number = DEFAULT_PRIMARY_WEIGHT_MULTIPLIER
): ScheduleDayAdherence {
  const date = resolved[0]?.date ?? localDateKey(now);
  const blocks: BlockAdherence[] = [];

  let weightedScore = 0;
  let weightTotal = 0;
  let plannedMs = 0;
  let onPlanTotal = 0;

  for (const block of resolved) {
    const plannedLength = Math.max(0, block.endTs - block.startTs);
    plannedMs += plannedLength;
    const elapsedMs = Math.max(0, Math.min(now, block.endTs) - block.startTs);

    let onPlanMs = 0;
    let offPlanMs = 0;
    for (let i = 0; i < activeEvents.length; i++) {
      const ev = activeEvents[i]!;
      // Only the elapsed slice of the block can contain tracked activity.
      const ms = overlapMs(ev.startTs, ev.endTs, block.startTs, block.startTs + elapsedMs);
      if (ms <= 0) continue;
      if (categorized[i]?.category === block.category) onPlanMs += ms;
      else offPlanMs += ms;
    }
    // Events can nominally overlap each other; never report more than the block.
    onPlanMs = Math.min(onPlanMs, elapsedMs);
    offPlanMs = Math.min(offPlanMs, Math.max(0, elapsedMs - onPlanMs));

    const adherence = elapsedMs > 0 ? onPlanMs / elapsedMs : null;
    const weight = block.isPrimary ? primaryMultiplier : 1;

    const status: BlockAdherence["status"] =
      now < block.startTs ? "upcoming" : now < block.endTs ? "active" : "done";

    blocks.push({
      block,
      elapsedMs,
      onPlanMs,
      offPlanMs,
      unaccountedMs: Math.max(0, elapsedMs - onPlanMs - offPlanMs),
      adherence,
      weight,
      status,
    });

    if (adherence !== null && elapsedMs > 0) {
      const w = weight * elapsedMs;
      weightedScore += adherence * w;
      weightTotal += w;
      onPlanTotal += onPlanMs;
    }
  }

  const primary = blocks.find((b) => b.block.isPrimary);

  return {
    date,
    score: weightTotal > 0 ? Math.round((weightedScore / weightTotal) * 100) : null,
    blocks,
    primaryScore:
      primary && primary.adherence !== null
        ? Math.round(primary.adherence * 100)
        : null,
    primaryTitle: primary?.block.title ?? null,
    plannedMs,
    onPlanMs: onPlanTotal,
  };
}

/** Combine seven scored days into a week, weighting each by elapsed plan time. */
export function scoreScheduleWeek(
  weekStartTs: number,
  perDay: readonly ScheduleDayAdherence[]
): ScheduleWeekAdherence {
  let weighted = 0;
  let weight = 0;
  let primaryWeighted = 0;
  let primaryWeight = 0;
  let plannedMs = 0;
  let onPlanMs = 0;

  for (const day of perDay) {
    plannedMs += day.plannedMs;
    onPlanMs += day.onPlanMs;
    const elapsed = day.blocks.reduce((s, b) => s + b.elapsedMs, 0);
    if (day.score !== null && elapsed > 0) {
      weighted += day.score * elapsed;
      weight += elapsed;
    }
    const primary = day.blocks.find((b) => b.block.isPrimary);
    if (day.primaryScore !== null && primary && primary.elapsedMs > 0) {
      primaryWeighted += day.primaryScore * primary.elapsedMs;
      primaryWeight += primary.elapsedMs;
    }
  }

  return {
    weekStart: localDateKey(weekStartTs),
    score: weight > 0 ? Math.round(weighted / weight) : null,
    primaryScore: primaryWeight > 0 ? Math.round(primaryWeighted / primaryWeight) : null,
    perDay: [...perDay],
    plannedMs,
    onPlanMs,
  };
}

/** The block covering `now`, if the user is inside one. */
export function currentBlock(
  resolved: readonly ResolvedScheduleBlock[],
  now: number = Date.now()
): ResolvedScheduleBlock | null {
  return resolved.find((b) => now >= b.startTs && now < b.endTs) ?? null;
}

/** The next block starting after `now` on the same day. */
export function nextBlock(
  resolved: readonly ResolvedScheduleBlock[],
  now: number = Date.now()
): ResolvedScheduleBlock | null {
  return resolved.find((b) => b.startTs > now) ?? null;
}

/** The seven YYYY-MM-DD keys of the week containing `ts`, Monday first. */
export function weekDateKeys(weekStartTs: number): string[] {
  const start = startOfLocalDay(weekStartTs);
  return Array.from({ length: 7 }, (_, i) => localDateKey(start + i * DAY_MS + DAY_MS / 2));
}
