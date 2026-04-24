/**
 * Maps old scaffold category names → the user's v0.6 taxonomy.
 * Used when migrating DB rules and when resolving rule matches in analysis.
 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  Coding: "Work",
  Research: "Learning",
  Writing: "Work",
  Design: "Work",
  Communication: "Work",
  Meetings: "Work",
  Gaming: "Entertainment",
  System: "Work",
};

/** Domains that always need title/URL semantics — never a single fixed bucket. */
export const SEMANTIC_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "linkedin.com",
]);

/**
 * Sensible defaults when rules + AI haven't run yet.
 */
export const DOMAIN_CATEGORY_HINTS: Record<string, string> = {
  "github.com": "Work",
  "gitlab.com": "Work",
  "bitbucket.org": "Work",
  "stackoverflow.com": "Learning",
  "stackexchange.com": "Learning",
  "developer.mozilla.org": "Learning",
  "docs.python.org": "Learning",
  "nodejs.org": "Learning",
  "rust-lang.org": "Learning",
  "chatgpt.com": "Learning",
  "claude.ai": "Learning",
  "perplexity.ai": "Learning",
  "console.groq.com": "Work",
  "groq.com": "Work",
  "hackerrank.com": "Learning",
  "candidatesupport.hackerrank.com": "Learning",
  "leetcode.com": "Learning",
  "linkedin.com": "Career",
  "indeed.com": "Career",
  "glassdoor.com": "Career",
  "greenhouse.io": "Career",
  "lever.co": "Career",
  "wellfound.com": "Career",
  "workdayjobs.com": "Career",
  "biblegateway.com": "Religion",
  "bible.com": "Religion",
  "youversion.com": "Religion",
  "biblehub.com": "Religion",
  "openbible.info": "Religion",
  "calendar.google.com": "Work",
  "mail.google.com": "Work",
  "docs.google.com": "Work",
  "sheets.google.com": "Work",
  "notion.so": "Work",
  "linear.app": "Work",
  "slack.com": "Work",
  "discord.com": "Social",
  "twitter.com": "Social",
  "x.com": "Social",
  "reddit.com": "Social",
  "facebook.com": "Social",
  "instagram.com": "Social",
  "tiktok.com": "Social",
  "netflix.com": "Entertainment",
  "twitch.tv": "Entertainment",
};

export function hintCategoryForDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const d = domain.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (DOMAIN_CATEGORY_HINTS[d]) return DOMAIN_CATEGORY_HINTS[d]!;
  for (const [pat, cat] of Object.entries(DOMAIN_CATEGORY_HINTS)) {
    if (d === pat || d.endsWith("." + pat)) return cat;
  }
  return null;
}

export function normalizeCategoryName(
  raw: string,
  validNames: ReadonlySet<string>
): string {
  if (validNames.has(raw)) return raw;
  if (raw === "Other" && validNames.has("Unclassified")) return "Unclassified";
  const mapped = LEGACY_CATEGORY_MAP[raw];
  if (mapped && validNames.has(mapped)) return mapped;
  return raw;
}
