import type {
  ActivityEvent,
  BreakdownBucket,
  CategorizedEvent,
  CategoryRule,
  PeriodBreakdown,
} from "@desktop-tracker/shared";
import { categorizeAll } from "./categorize.js";

/** Build a breakdown when callers have already computed effective categories. */
export function buildBreakdownFromCategories(
  events: readonly ActivityEvent[],
  categories: readonly CategorizedEvent[]
): PeriodBreakdown {
  const byApp = bucketBy(events, categories, (e) => e.exe, (k) => k);
  const byProject = bucketBy(events, categories, (e) => e.project, (k) => k);
  const byDomain = bucketBy(events, categories, (e) => e.domain, (k) => k);
  const byBrowserProfile = bucketBy(events, categories, (e) => e.browserProfile, (k) => k);

  const catMap = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const c = categories[i]?.category ?? "Unclassified";
    catMap.set(c, (catMap.get(c) ?? 0) + events[i]!.durationMs);
  }
  const byCategory: BreakdownBucket[] = [...catMap.entries()]
    .map(([k, durationMs]) => ({ key: k, label: k, durationMs, category: k }))
    .sort((a, b) => b.durationMs - a.durationMs);

  return { byApp, byProject, byDomain, byBrowserProfile, byCategory };
}

/** Group events by a key function, summing durationMs. */
export function bucketBy<K extends string | null>(
  events: readonly ActivityEvent[],
  categories: readonly CategorizedEvent[],
  key: (e: ActivityEvent) => K,
  label: (k: NonNullable<K>) => string
): BreakdownBucket[] {
  const map = new Map<
    string,
    { sourceKey: string; duration: number; category: string | null }
  >();
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const k = key(e);
    if (k === null || k === undefined || k === "") continue;
    const sourceKey = String(k);
    const cat = categories[i]?.category ?? "Unclassified";
    const bucketKey = `${sourceKey}::${cat}`;
    const existing = map.get(bucketKey);
    if (existing) {
      existing.duration += e.durationMs;
    } else {
      map.set(bucketKey, { sourceKey, duration: e.durationMs, category: cat });
    }
  }
  return [...map.entries()]
    .map(([bucketKey, v]) => ({
      key: bucketKey,
      label: label(v.sourceKey as NonNullable<K>),
      durationMs: v.duration,
      category: v.category,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

export function buildBreakdown(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[]
): PeriodBreakdown {
  const categories = categorizeAll(events, rules);

  const byApp = bucketBy(events, categories, (e) => e.exe, (k) => k);
  const byProject = bucketBy(events, categories, (e) => e.project, (k) => k);
  const byDomain = bucketBy(events, categories, (e) => e.domain, (k) => k);
  const byBrowserProfile = bucketBy(events, categories, (e) => e.browserProfile, (k) => k);

  const catMap = new Map<string, number>();
  for (let i = 0; i < events.length; i++) {
    const c = categories[i]?.category ?? "Unclassified";
    catMap.set(c, (catMap.get(c) ?? 0) + events[i]!.durationMs);
  }
  const byCategory: BreakdownBucket[] = [...catMap.entries()]
    .map(([k, durationMs]) => ({ key: k, label: k, durationMs, category: k }))
    .sort((a, b) => b.durationMs - a.durationMs);

  return { byApp, byProject, byDomain, byBrowserProfile, byCategory };
}

export function sumDuration(events: readonly ActivityEvent[]): number {
  let s = 0;
  for (const e of events) s += e.durationMs;
  return s;
}

export function partitionActiveIdle(
  events: readonly ActivityEvent[]
): { active: ActivityEvent[]; idle: ActivityEvent[] } {
  const active: ActivityEvent[] = [];
  const idle: ActivityEvent[] = [];
  for (const e of events) {
    if (e.isIdle || e.isLocked) idle.push(e);
    else active.push(e);
  }
  return { active, idle };
}
