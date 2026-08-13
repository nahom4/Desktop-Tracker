/**
 * Weekly schedule — the plan the user intends to follow, against which actual
 * tracked activity is graded.
 *
 * The model is a repeating weekly **template** plus dated **overrides**:
 *
 *   template   "Mon 10:30–13:00 Startup work"   repeats every Monday, forever
 *   override   "on 2026-08-10 that block is Learning instead"   one day only
 *
 * That split is what makes "just for this week" and "make it weekly" two
 * different save buttons rather than two different data models: editing the
 * template changes every future week, writing an override changes one date.
 */

/** 0 = Monday … 6 = Sunday, matching `startOfLocalWeek` (weeks start Monday). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const DAY_SHORT_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * One recurring block in the weekly plan, e.g. "Tue 09:30–10:30 Bible study".
 * Times are minutes from local midnight so the block lands at the same wall
 * clock time regardless of DST.
 */
export interface ScheduleBlock {
  id: number;
  dayOfWeek: DayOfWeek;
  /** Minutes from local midnight, 0–1439. */
  startMin: number;
  /** Minutes from local midnight, 1–1440. Always greater than `startMin`. */
  endMin: number;
  title: string;
  /** Category name this block's time should be spent in — grades adherence. */
  category: string;
  /**
   * The day's most important task. Exactly one block per populated day carries
   * this flag, and it is weighted more heavily when scoring adherence.
   */
  isPrimary: boolean;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export type NewScheduleBlock = Omit<ScheduleBlock, "id" | "createdAt" | "updatedAt">;
export type ScheduleBlockPatch = Partial<
  Omit<ScheduleBlock, "id" | "createdAt" | "updatedAt">
>;

/**
 * A one-date deviation from the template — "this week only".
 *
 *  * `modify` — the template block runs on this date with different fields.
 *  * `remove` — the template block is skipped on this date.
 *  * `add`    — an extra block exists only on this date (`blockId` is null).
 */
export type ScheduleOverrideKind = "modify" | "remove" | "add";

export interface ScheduleOverride {
  id: number;
  /** Local calendar date this override applies to, YYYY-MM-DD. */
  date: string;
  /** Template block being modified/removed; null for `add`. */
  blockId: number | null;
  kind: ScheduleOverrideKind;
  startMin: number | null;
  endMin: number | null;
  title: string | null;
  category: string | null;
  isPrimary: boolean | null;
  notes: string | null;
  createdAt: number;
}

export type NewScheduleOverride = Omit<ScheduleOverride, "id" | "createdAt">;

/**
 * A block resolved onto a concrete date: template merged with any override,
 * with absolute timestamps ready to compare against tracked events.
 */
export interface ResolvedScheduleBlock {
  /** Template block id, or null for a one-off `add` override. */
  blockId: number | null;
  /** Override row that produced or altered this block, when any. */
  overrideId: number | null;
  date: string;
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  /** Absolute local-time epoch ms for the block's start / end on `date`. */
  startTs: number;
  endTs: number;
  title: string;
  category: string;
  isPrimary: boolean;
  notes: string | null;
  /** True when this block only exists on this date (added or modified). */
  isOverridden: boolean;
}

/** How well one block's planned time was actually spent on its category. */
export interface BlockAdherence {
  block: ResolvedScheduleBlock;
  /** Planned length of the block that has already elapsed, in ms. */
  elapsedMs: number;
  /** Tracked active time inside the block that matched `block.category`. */
  onPlanMs: number;
  /** Tracked active time inside the block spent on some other category. */
  offPlanMs: number;
  /** Elapsed block time with no tracked activity at all (idle, locked, away). */
  unaccountedMs: number;
  /** `onPlanMs / elapsedMs`, 0..1. Null while the block is still in the future. */
  adherence: number | null;
  /** Relative weight this block carries in the day score (primary counts more). */
  weight: number;
  status: "upcoming" | "active" | "done";
}

/** Rolled-up adherence for a single day. */
export interface ScheduleDayAdherence {
  date: string;
  /** 0–100 weighted adherence across every elapsed block. Null when nothing was planned. */
  score: number | null;
  blocks: BlockAdherence[];
  /** Adherence for the day's most important task alone, 0–100. */
  primaryScore: number | null;
  primaryTitle: string | null;
  plannedMs: number;
  onPlanMs: number;
}

/** Rolled-up adherence for a week (Monday-based). */
export interface ScheduleWeekAdherence {
  weekStart: string;
  /** Weighted mean of the per-day scores, over days that had a plan. */
  score: number | null;
  primaryScore: number | null;
  perDay: ScheduleDayAdherence[];
  plannedMs: number;
  onPlanMs: number;
}

/**
 * How much more the day's most important task counts than an ordinary block.
 * 2 means "the MIT is worth two normal blocks of the same length".
 */
export const DEFAULT_PRIMARY_WEIGHT_MULTIPLIER = 2;

// ---- IPC payloads ----

export interface SchedulePlanDay {
  date: string;
  dayOfWeek: DayOfWeek;
  blocks: ResolvedScheduleBlock[];
  /** Rule violations for this day, e.g. a missing most-important task. */
  errors: ScheduleValidationError[];
}

/** A whole week resolved for display, plus the template behind it for editing. */
export interface SchedulePlanWeek {
  weekStart: string;
  weekStartTs: number;
  days: SchedulePlanDay[];
  template: ScheduleBlock[];
}

/**
 * Today's time for one category, planned against actual — the same shape of
 * answer the category-health bars give, but with the target coming from the
 * day's schedule rather than a fixed weekly goal.
 */
export interface SchedulePlanCategoryStat {
  category: string;
  /** Category colour, for the bar. */
  color: string;
  /** Total scheduled for this category today. */
  plannedMs: number;
  /** Scheduled time that has already elapsed — the fair denominator so far. */
  elapsedPlannedMs: number;
  /** Tracked in-category time that landed inside those blocks. */
  onPlanMs: number;
  /** Tracked in-category time today, wherever it happened. */
  actualMs: number;
}

/** What the plan says should be happening right now, and how it is going. */
export interface ScheduleNowStatus {
  now: number;
  current: ResolvedScheduleBlock | null;
  next: ResolvedScheduleBlock | null;
  /** Adherence for the block in progress, 0–100; null when between blocks. */
  currentAdherence: number | null;
  today: ScheduleDayAdherence;
  /** Per-category planned-vs-actual, for categories scheduled today only. */
  byCategory: SchedulePlanCategoryStat[];
  /** Productive time today in categories the plan did not ask for. */
  offPlanProductive: OffPlanProductive;
}

/**
 * Worthwhile work that was not on today's plan.
 *
 * Adherence deliberately ignores it — an unplanned hour of Learning is still a
 * departure from the plan. But it is not the same as an hour of Entertainment,
 * and collapsing the two would make the day look worse than it was. So it is
 * counted separately: credited, not smuggled into the adherence number.
 */
export interface OffPlanProductive {
  totalMs: number;
  byCategory: { category: string; color: string; ms: number }[];
}

/** Validation failure from `validateDayBlocks`, surfaced inline in the editor. */
export interface ScheduleValidationError {
  code: "overlap" | "bad-range" | "no-primary" | "multiple-primary" | "empty-title";
  message: string;
  /** Ids of the blocks involved, where the error refers to saved rows. */
  blockIds: number[];
}
