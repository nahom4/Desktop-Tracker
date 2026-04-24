import type {
  ActivityEvent,
  Category,
  CategorizedEvent,
  CategoryRule,
  EventTag,
} from "@desktop-tracker/shared";
import {
  LEGACY_CATEGORY_MAP,
  SEMANTIC_DOMAINS,
  normalizeCategoryName,
} from "@desktop-tracker/defaults";

const FALLBACK_CATEGORY = "Unclassified";
const STRONG_RULE_PRIORITY = 8;
const AI_CONFIDENCE_TO_USE = 0.65;

export function categorize(
  event: Pick<ActivityEvent, "exe" | "domain" | "project" | "title">,
  rules: readonly CategoryRule[]
): CategorizedEvent {
  let best: CategoryRule | null = null;

  for (const rule of rules) {
    if (!matches(event, rule)) continue;
    if (!best || rule.priority > best.priority) best = rule;
  }

  if (!best) return { ...inferWithoutRule(), source: "fallback" };

  const mapped = LEGACY_CATEGORY_MAP[best.category] ?? best.category;
  return {
    category: mapped,
    weight: isNeutralCategory(mapped) ? 0 : best.weight,
    rulePriority: best.priority,
    ruleMatchType: best.matchType,
    source: "rule",
  };
}

export function categorizeAllWithTags(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[],
  tagsByEventId: ReadonlyMap<number, EventTag[]>,
  categories: readonly Category[]
): CategorizedEvent[] {
  const catByName = new Map<string, Category>();
  for (const c of categories) catByName.set(c.name, c);
  const validNames = new Set(catByName.keys());

  const out: CategorizedEvent[] = new Array(events.length);
  const ruleCache = new Map<string, CategorizedEvent>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const tags = tagsByEventId.get(e.id) ?? [];

    const manual = tags
      .filter((t) => t.source === "manual")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (manual) {
      out[i] = {
        ...resolveEffective(manual.category, catByName, validNames, manual.confidence ?? 1),
        source: "manual",
      };
      continue;
    }

    const rule = ruleForEvent(e, rules, ruleCache);
    if (isStrongRule(rule, e)) {
      out[i] = {
        ...resolveEffective(rule.category, catByName, validNames, 1, rule.weight),
        rulePriority: rule.rulePriority,
        source: "rule",
      };
      continue;
    }

    const ai = tags
      .filter((t) => t.source === "ai" && !isNeutralCategory(t.category))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    if (ai && (ai.confidence ?? 0) >= AI_CONFIDENCE_TO_USE) {
      out[i] = {
        ...resolveEffective(ai.category, catByName, validNames, ai.confidence ?? 0),
        source: "ai",
      };
      continue;
    }

    const hadRule = rule.source === "rule";
    out[i] = {
      ...resolveEffective(rule.category, catByName, validNames, 1, rule.weight),
      rulePriority: rule.rulePriority,
      source: hadRule ? "rule" : "fallback",
    };
  }
  return out;
}

function ruleForEvent(
  e: ActivityEvent,
  rules: readonly CategoryRule[],
  cache: Map<string, CategorizedEvent>
): CategorizedEvent {
  const key = `${e.exe}|${e.domain ?? ""}|${e.project ?? ""}|${e.title ?? ""}`;
  let rule = cache.get(key);
  if (!rule) {
    rule = categorize(e, rules);
    cache.set(key, rule);
  }
  return rule;
}

function inferWithoutRule(): CategorizedEvent {
  return { category: FALLBACK_CATEGORY, weight: 0 };
}

function resolveEffective(
  raw: string,
  catByName: Map<string, Category>,
  validNames: ReadonlySet<string>,
  confidence: number,
  ruleWeight?: number
): CategorizedEvent {
  if (isNeutralCategory(raw)) return { category: FALLBACK_CATEGORY, weight: 0 };

  const name = normalizeCategoryName(raw, validNames);
  const c = catByName.get(name);
  if (!c) {
    return ruleWeight !== undefined
      ? { category: name, weight: ruleWeight }
      : inferWithoutRule();
  }

  if (ruleWeight !== undefined) return { category: c.name, weight: ruleWeight };

  // AI labels are allowed to choose the bucket, but low-confidence labels should
  // not give full target credit. The label is useful; the score stays cautious.
  const confidenceWeight = Math.max(0.65, Math.min(1, confidence));
  return { category: c.name, weight: c.weight * confidenceWeight };
}

function isNeutralCategory(category: string): boolean {
  return category === "Other" || category === FALLBACK_CATEGORY;
}

function isStrongRule(
  cat: CategorizedEvent,
  event: Pick<ActivityEvent, "domain">
): boolean {
  if (cat.source !== "rule") return false;
  if ((cat.rulePriority ?? 0) < STRONG_RULE_PRIORITY) return false;
  if (cat.ruleMatchType === "title_regex" || cat.ruleMatchType === "project") {
    return true;
  }
  return !isSemanticDomain(event.domain);
}

function isSemanticDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (SEMANTIC_DOMAINS.has(d)) return true;
  for (const pat of SEMANTIC_DOMAINS) {
    if (d.endsWith("." + pat)) return true;
  }
  return false;
}

function matches(
  event: Pick<ActivityEvent, "exe" | "domain" | "project" | "title">,
  rule: CategoryRule
): boolean {
  const pat = rule.pattern.toLowerCase();
  switch (rule.matchType) {
    case "exe":
      return event.exe.toLowerCase() === pat;
    case "domain": {
      const d = event.domain?.toLowerCase();
      if (!d) return false;
      return d === pat || d.endsWith("." + pat);
    }
    case "project":
      return (event.project?.toLowerCase() ?? "") === pat;
    case "title_regex": {
      if (!event.title) return false;
      try {
        return new RegExp(rule.pattern, "i").test(event.title);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export function categorizeAll(
  events: readonly ActivityEvent[],
  rules: readonly CategoryRule[]
): CategorizedEvent[] {
  const cache = new Map<string, CategorizedEvent>();
  const out: CategorizedEvent[] = new Array(events.length);
  for (let i = 0; i < events.length; i++) {
    out[i] = ruleForEvent(events[i]!, rules, cache);
  }
  return out;
}
