import type {
  ActivityEvent,
  Category,
  CategoryRule,
  CategorizedEvent,
  EventTag,
  StormInterval,
} from "@desktop-tracker/shared";
import { categorizeAllWithTags } from "./categorize.js";
import { partitionActiveIdle, sumDuration } from "./aggregate.js";
import { computeProductivity } from "./productivity.js";

/** Only sub-90s gaps allow merging sessions (alt-tab). Coffee / idle gaps are longer → block ends. */
const FOCUS_ALT_TAB_GAP_MS = 90 * 1000;
const MIN_FOCUS_BLOCK_MS = 20 * 60 * 1000;
const IDEAL_FOCUS_BLOCK_MS = 45 * 60 * 1000;
const SWITCH_RECOVERY_TAX_MS = 5 * 60 * 1000;

function isYoutubeDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^(www|m|mobile)\./, "");
  return d === "youtube.com" || d === "youtu.be" || d.endsWith(".youtube.com");
}

function crossesYoutubeBoundary(
  prev: Pick<ActivityEvent, "domain">,
  cur: Pick<ActivityEvent, "domain">
): boolean {
  return isYoutubeDomain(prev.domain) !== isYoutubeDomain(cur.domain);
}

function countsAsCategorySwitch(
  prevCat: string,
  curCat: string,
  prev: Pick<ActivityEvent, "domain">,
  cur: Pick<ActivityEvent, "domain">
): boolean {
  if (prevCat !== curCat) return true;
  return crossesYoutubeBoundary(prev, cur);
}

export interface Scores {
  productivity: number; // 0–100
  focus: number; // 0–100
  longestFocusBlockMs: number;
  /** Category changes (incl. opening YouTube) while active — not same-category alt-tab. */
  contextSwitches: number;
  deepWorkMs: number;
}

export interface ScoreContext {
  tagsByEventId?: ReadonlyMap<number, EventTag[]>;
  categories?: readonly Category[];
  period?: "day" | "week";
  targetMs?: number;
}

function resolveCategories(
  active: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  ctx: ScoreContext
): CategorizedEvent[] {
  const tags = ctx.tagsByEventId ?? new Map();
  const cats = ctx.categories ?? [];
  if (cats.length > 0) {
    return categorizeAllWithTags(active, rules, tags, cats);
  }
  return categorizeAllWithTags(active, rules, tags, []);
}

function categoryName(cats: readonly CategorizedEvent[], index: number): string {
  return cats[index]?.category ?? "Learning";
}

/**
 * Productivity = duration-weighted category weights mapped to 0–100 (see productivity.ts).
 */
export function productivityScore(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  ctx: ScoreContext = {}
): { score: number; deepWorkMs: number } {
  const { active, idle } = partitionActiveIdle(events);
  if (active.length === 0 && idle.length === 0) return { score: 0, deepWorkMs: 0 };

  const cats = resolveCategories(active, rules, ctx);
  const catByName = new Map((ctx.categories ?? []).map((c) => [c.name, c]));
  let deepWorkMs = 0;
  for (let i = 0; i < active.length; i++) {
    const name = categoryName(cats, i);
    const w = cats[i]?.weight ?? catByName.get(name)?.weight ?? 0;
    if (w >= 0.8) deepWorkMs += active[i]!.durationMs;
  }

  const prod = computeProductivity(
    active,
    cats,
    ctx.categories ?? [],
    sumDuration(idle),
    { period: ctx.period, targetMs: ctx.targetMs }
  );

  return {
    score: prod.score,
    deepWorkMs,
  };
}

/**
 * Focus rewards staying in one category. Same-category alt-tab (e.g. editor ↔
 * localhost, both Work) within 90s is fine. Coffee / idle gaps (wall-clock gap
 * between active sessions) end the block. Any category change — Work → Business
 * YouTube, Work → Learning, etc. — counts as a switch. Entering/leaving
 * youtube.com always counts even if the video is tagged Business.
 */
export function focusScore(
  active: readonly ActivityEvent[],
  idle: readonly ActivityEvent[],
  categories: readonly CategorizedEvent[]
): {
  score: number;
  longestFocusBlockMs: number;
  contextSwitches: number;
} {
  if (active.length === 0) {
    return { score: 0, longestFocusBlockMs: 0, contextSwitches: 0 };
  }

  const order = active
    .map((_, i) => i)
    .sort((a, b) => active[a]!.startTs - active[b]!.startTs);

  let longest = 0;
  let runStart = active[order[0]!]!.startTs;
  let runEnd = active[order[0]!]!.endTs;
  let runCat = categoryName(categories, order[0]!);
  let runEv = active[order[0]!]!;
  let switches = 0;

  for (let oi = 1; oi < order.length; oi++) {
    const idx = order[oi]!;
    const cur = active[idx]!;
    const curCat = categoryName(categories, idx);
    const gap = cur.startTs - runEnd;

    if (
      gap <= FOCUS_ALT_TAB_GAP_MS &&
      runCat === curCat &&
      !crossesYoutubeBoundary(runEv, cur)
    ) {
      runEnd = cur.endTs;
      runEv = cur;
      continue;
    }

    longest = Math.max(longest, runEnd - runStart);
    if (countsAsCategorySwitch(runCat, curCat, runEv, cur)) switches++;

    runStart = cur.startTs;
    runEnd = cur.endTs;
    runCat = curCat;
    runEv = cur;
  }
  longest = Math.max(longest, runEnd - runStart);

  const activeDuration = sumDuration(active);
  const targetBlockMs = Math.min(
    IDEAL_FOCUS_BLOCK_MS,
    Math.max(MIN_FOCUS_BLOCK_MS, activeDuration * 0.6)
  );
  const blockComponent = Math.min(1, longest / targetBlockMs);
  const switchComponent =
    activeDuration > 0
      ? activeDuration / (activeDuration + switches * SWITCH_RECOVERY_TAX_MS)
      : 0;
  const focusableMs = active.reduce((sum, ev, i) => {
    const cat = categories[i];
    return sum + ((cat?.weight ?? 0) > 0 ? ev.durationMs : 0);
  }, 0);
  const engagementComponent =
    activeDuration > 0 ? Math.min(1, focusableMs / activeDuration) : 0;

  const score = Math.round(
    Math.pow(blockComponent * switchComponent * engagementComponent, 1 / 3) * 100
  );
  return { score, longestFocusBlockMs: longest, contextSwitches: switches };
}

export function computeScores(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  ctx: ScoreContext = {}
): Scores {
  const { active, idle } = partitionActiveIdle(events);
  const cats = resolveCategories(active, rules, ctx);
  const prod = productivityScore(events, rules, ctx);
  const foc = focusScore(active, idle, cats);
  return {
    productivity: prod.score,
    focus: foc.score,
    deepWorkMs: prod.deepWorkMs,
    longestFocusBlockMs: foc.longestFocusBlockMs,
    contextSwitches: foc.contextSwitches,
  };
}

/**
 * Detect bursts of rapid *category* switching (not mere app alt-tab within Work).
 */
export function detectStorms(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  ctx: ScoreContext = {},
  options: { windowMs?: number; minSwitchesPerMin?: number } = {}
): StormInterval[] {
  const windowMs = options.windowMs ?? 60_000;
  const minSwitches = options.minSwitchesPerMin ?? 5;

  const { active } = partitionActiveIdle(events);
  if (active.length < 2) return [];

  const cats = resolveCategories(active, rules, ctx);
  const sorted = active
    .map((_, i) => i)
    .sort((a, b) => active[a]!.startTs - active[b]!.startTs);

  const switchTs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const prevEv = active[prev]!;
    const curEv = active[cur]!;
    if (
      countsAsCategorySwitch(
        categoryName(cats, prev),
        categoryName(cats, cur),
        prevEv,
        curEv
      )
    ) {
      switchTs.push(curEv.startTs);
    }
  }
  if (switchTs.length < minSwitches) return [];

  const storms: StormInterval[] = [];
  let curStart: number | null = null;
  let curEnd = 0;
  let curTotal = 0;
  let curPeak = 0;

  for (let i = 0; i < switchTs.length; i++) {
    const t = switchTs[i]!;
    let j = i;
    while (j < switchTs.length && switchTs[j]! - t < windowMs) j++;
    const count = j - i;
    if (count < minSwitches) continue;

    const windowEnd = switchTs[j - 1]!;
    if (curStart === null) {
      curStart = t;
      curEnd = windowEnd;
      curTotal = count;
      curPeak = count;
    } else if (t <= curEnd + windowMs) {
      curEnd = Math.max(curEnd, windowEnd);
      curTotal += count;
      if (count > curPeak) curPeak = count;
    } else {
      storms.push({
        startTs: curStart,
        endTs: curEnd,
        peakSwitchesPerMin: curPeak,
        totalSwitches: curTotal,
      });
      curStart = t;
      curEnd = windowEnd;
      curTotal = count;
      curPeak = count;
    }
  }
  if (curStart !== null) {
    storms.push({
      startTs: curStart,
      endTs: curEnd,
      peakSwitchesPerMin: curPeak,
      totalSwitches: curTotal,
    });
  }
  return storms;
}
