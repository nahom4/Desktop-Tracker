import type { CategorizedEvent, Category } from "@desktop-tracker/shared";

export interface ProductivityResult {
  /** Final 0-100 score shown in the UI. */
  score: number;
  /** Average quality of active minutes before target coverage is applied. */
  quality: number;
  /** Net target progress after distraction penalty, 0..1. */
  activeRatio: number;
}

/**
 * Productivity answers: "How much of the user's intended valuable work did
 * they actually bank?"
 *
 * Positive, health-tracked categories define the denominator. Each category is
 * capped at its own target, so six extra hours of Work cannot hide zero
 * Learning/Career progress. Negative categories subtract by opportunity cost:
 * an hour at -1 cancels one target-weighted hour.
 */
export function computeProductivity(
  events: readonly { durationMs: number }[],
  cats: readonly CategorizedEvent[],
  categories: readonly Category[],
  idleMs = 0,
  options: { period?: "day" | "week"; targetMs?: number } = {}
): ProductivityResult {
  if (events.length === 0 && idleMs === 0) {
    return { score: 0, quality: 0, activeRatio: 0 };
  }

  const period = options.period ?? "day";
  const catByName = new Map(categories.map((c) => [c.name, c]));
  const positiveByCategory = new Map<string, number>();
  let activeMs = 0;
  let weighted = 0;
  let penaltyMs = 0;

  for (let i = 0; i < events.length; i++) {
    const d = events[i]!.durationMs;
    const cat = cats[i];
    const w = productivityWeightFor(cat, catByName);
    activeMs += d;
    weighted += d * w;

    if (!cat || cat.source === "fallback") continue;
    if (w > 0) {
      positiveByCategory.set(
        cat.category,
        (positiveByCategory.get(cat.category) ?? 0) + d * w
      );
    } else if (w < 0) {
      penaltyMs += d * Math.abs(w);
    }
  }

  const trackedMs = activeMs + idleMs;
  if (trackedMs === 0) return { score: 0, quality: 0, activeRatio: 0 };

  const avg = activeMs > 0 ? weighted / activeMs : 0;
  const quality = Math.round(Math.max(0, Math.min(100, ((avg + 1) / 2) * 100)));
  const target = buildTarget(categories, period, options.targetMs);

  let earnedMs = 0;
  for (const t of target.byCategory) {
    earnedMs += Math.min(positiveByCategory.get(t.name) ?? 0, t.weightedMs);
  }

  const net = Math.max(0, earnedMs - penaltyMs);
  const ratio = Math.max(0, Math.min(1, net / target.weightedMs));
  return {
    score: Math.round(ratio * 100),
    quality,
    activeRatio: ratio,
  };
}

/** @deprecated use computeProductivity */
export function productivityFromCategories(
  events: readonly { durationMs: number }[],
  cats: readonly CategorizedEvent[],
  categories: readonly Category[],
  idleMs = 0
): number {
  return computeProductivity(events, cats, categories, idleMs).score;
}

function productivityWeightFor(
  cat: CategorizedEvent | undefined,
  catByName: Map<string, Category>
): number {
  if (!cat || cat.source === "fallback") return 0;
  return cat.weight ?? catByName.get(cat.category)?.weight ?? 0;
}

function buildTarget(
  categories: readonly Category[],
  period: "day" | "week",
  fallbackMs: number | undefined
): {
  weightedMs: number;
  byCategory: { name: string; weightedMs: number }[];
} {
  const byCategory: { name: string; weightedMs: number }[] = [];
  for (const c of categories) {
    if (!c.isHealthTracked || c.weight <= 0) continue;
    const targetMin = period === "day" ? c.targetMinPerDay : c.targetMinPerWeek;
    if (!targetMin || targetMin <= 0) continue;
    byCategory.push({
      name: c.name,
      weightedMs: targetMin * 60_000 * c.weight,
    });
  }

  const weightedMs = byCategory.reduce((sum, t) => sum + t.weightedMs, 0);
  if (weightedMs > 0) return { weightedMs, byCategory };

  const fallback = Math.max(1, fallbackMs ?? (period === "day" ? 8 : 40) * 3_600_000);
  return {
    weightedMs: fallback,
    byCategory: [{ name: "Productive", weightedMs: fallback }],
  };
}
