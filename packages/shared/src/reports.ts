export interface BreakdownBucket {
  key: string;
  label: string;
  durationMs: number;
  category: string | null;
}

/**
 * A burst of rapid *category* switching — when attention jumps between
 * unrelated kinds of work (Work → Social → Entertainment, etc.). Alt-tabbing
 * between editor and browser within the same category does not count.
 */
export interface StormInterval {
  startTs: number;
  endTs: number;
  /** Peak category switches observed inside any storm-window in this span. */
  peakSwitchesPerMin: number;
  /** Total category switches inside the interval. */
  totalSwitches: number;
}

/**
 * AI-generated narrative review for a day or week. Produced once at
 * end-of-period by a stronger model (default llama-3.3-70b). Persisted
 * inside the report payload + surfaced as the headline card.
 */
export interface AiReview {
  generatedAt: number;
  model: string;
  period: "daily" | "weekly";
  /** Two-sentence summary read at the top of the report card. */
  summary: string;
  /** Concrete wins / what went well — short bullets. */
  wins: string[];
  /** Misses / red flags — short bullets. */
  misses: string[];
  /** Single highest-value recommendation for the next period. */
  recommendation: string;
  /** Optional longer reasoning narrative (focus break, distraction analysis). */
  notes: string | null;
}

export interface PeriodBreakdown {
  byApp: BreakdownBucket[];
  byProject: BreakdownBucket[];
  byDomain: BreakdownBucket[];
  byBrowserProfile: BreakdownBucket[];
  byCategory: BreakdownBucket[];
}

export interface DailyReport {
  date: string; // YYYY-MM-DD
  periodStart: number;
  periodEnd: number;
  totalActiveMs: number;
  totalIdleMs: number;
  productivityScore: number; // 0–100
  /** Active-minute category quality before idle penalty (0–100). */
  productivityQuality: number;
  /** Net progress toward productive targets after distraction penalty, 0..1. */
  activeRatio: number;
  focusScore: number; // 0–100
  breakdown: PeriodBreakdown;
  longestFocusBlockMs: number;
  /** Category changes (and YouTube hops) — same-category alt-tab does not count. */
  contextSwitches: number;
  storms: StormInterval[];
  /** Per-category health for the reporting period. */
  health: CategoryHealth[];
  /** Per-card copy — not shared across productivity vs focus. */
  productivityTip: string;
  focusTip: string;
  /** Optional cross-cutting highlight (distractions, etc.). */
  oneChange: string | null;
  /** AI-generated narrative review. Populated by the scheduler / on-demand. */
  aiReview?: AiReview | null;
}

export interface WeeklyReport {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  totalActiveMs: number;
  totalIdleMs: number;
  averageProductivityScore: number;
  averageFocusScore: number;
  productivityScoreDelta: number; // vs previous week
  focusScoreDelta: number;
  breakdown: PeriodBreakdown;
  topDistractions: BreakdownBucket[];
  deepWorkHours: number;
  perDay: DailyReport[];
  storms: StormInterval[];
  health: CategoryHealth[];
  productivityTip: string;
  focusTip: string;
  oneChange: string | null;
  aiReview?: AiReview | null;
}

/** Persisted report row metadata as surfaced to the renderer. */
export interface PersistedReportRef {
  id: number;
  kind: "daily" | "weekly";
  periodStart: number;
  periodEnd: number;
  createdAt: number;
}

export type ExportFormat = "pdf" | "png";
export interface ExportRequest {
  format: ExportFormat;
  suggestedName: string;
}
export interface ExportResult {
  saved: boolean;
  path?: string;
  reason?: string;
}

/**
 * Snapshot of progress toward a tracked category's target for a single
 * reporting period (day or week). Surfaced as a progress bar in the UI.
 */
export interface CategoryHealth {
  category: string;
  color: string;
  /** Actual time spent in this category during the period, in ms. */
  actualMs: number;
  /** Target for this period (per_day_ms for daily, per_week_ms for weekly). */
  targetMs: number | null;
  /** 0..1 progress (capped at 1) — null when no target is set. */
  progress: number | null;
  /** Health-tracked categories are sorted to the front in the UI. */
  isHealthTracked: boolean;
}
