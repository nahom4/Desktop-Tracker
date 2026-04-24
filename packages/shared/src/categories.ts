export type CategoryWeight = number; // -1 (distracting) .. +1 (productive)

export type RuleMatchType = "exe" | "domain" | "project" | "title_regex";

export interface CategoryRule {
  id: number;
  matchType: RuleMatchType;
  pattern: string;
  category: string;
  weight: CategoryWeight;
  /** Higher priority wins when multiple rules match. */
  priority: number;
}

export type NewCategoryRule = Omit<CategoryRule, "id">;

/**
 * A user-managed category. Persisted in the `categories` table, edited
 * from the UI, and fed into the AI classifier prompt so the LLM uses the
 * user's own taxonomy.
 */
export interface Category {
  id: number;
  name: string;
  /** Free-text hint that becomes part of the LLM prompt. */
  description: string;
  color: string;
  /** -1..1 productivity weight (same scale as CategoryRule). */
  weight: CategoryWeight;
  /** Whether this is one of the seeded defaults (un-deletable). */
  isDefault: boolean;
  /** Health-tracked categories get a target line on Today / Weekly. */
  isHealthTracked: boolean;
  /** Optional per-day target in minutes (e.g. 30 = "half an hour a day"). */
  targetMinPerDay: number | null;
  /** Optional per-week target in minutes. */
  targetMinPerWeek: number | null;
  createdAt: number;
}

export type NewCategory = Omit<Category, "id" | "createdAt">;
export type CategoryPatch = Partial<Omit<Category, "id" | "createdAt" | "isDefault">>;

/** Provenance of a category assignment for one event. */
export type EventTagSource = "rule" | "ai" | "manual";

export interface EventTag {
  id: number;
  eventId: number;
  category: string;
  source: EventTagSource;
  /** 0..1; null for rule + manual. */
  confidence: number | null;
  model: string | null;
  createdAt: number;
}

export type NewEventTag = Omit<EventTag, "id" | "createdAt">;

/**
 * Built-in category names. Custom names are allowed; these are just the ones
 * the default ruleset uses so the UI can colour them consistently.
 */
export const BUILTIN_CATEGORIES = [
  "Work",
  "Religion",
  "Learning",
  "Career",
  "Business",
  "Coding",
  "Research",
  "Writing",
  "Design",
  "Communication",
  "Meetings",
  "Entertainment",
  "Social",
  "Gaming",
  "System",
  "Unclassified",
] as const;

export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  // user-tracked defaults
  Work: "#22c55e",
  Religion: "#f59e0b",
  Learning: "#0ea5e9",
  Career: "#14b8a6",
  Business: "#8b5cf6",
  // legacy / auxiliary
  Coding: "#22c55e",
  Research: "#3b82f6",
  Writing: "#06b6d4",
  Design: "#a855f7",
  Communication: "#eab308",
  Meetings: "#f97316",
  Entertainment: "#f43f5e",
  Social: "#ec4899",
  Gaming: "#ef4444",
  System: "#64748b",
  Unclassified: "#94a3b8",
};

export interface CategorizedEvent {
  category: string;
  weight: CategoryWeight;
  /** Priority of the deterministic rule, when source is rule. */
  rulePriority?: number;
  /** Match type of the deterministic rule, when source is rule. */
  ruleMatchType?: RuleMatchType;
  /** manual / ai / rule = counts toward productivity; fallback = unconfirmed guess. */
  source?: "manual" | "ai" | "rule" | "fallback";
}
