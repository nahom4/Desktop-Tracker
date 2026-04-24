import type { NewCategoryRule } from "@desktop-tracker/shared";

/**
 * Domain -> user taxonomy (Work / Learning / Career / Business / Religion /
 * Entertainment / Social).
 *
 * Mixed-intent domains such as YouTube, Reddit, and LinkedIn are classified
 * from title/URL context by title rules and AI instead of blunt domain rules.
 */
export const DEFAULT_DOMAIN_RULES: NewCategoryRule[] = [
  // Work - source control, cloud/devops dashboards, planning, docs, comms.
  { matchType: "domain", pattern: "github.com",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "gitlab.com",              category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "bitbucket.org",           category: "Work",          weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "vercel.com",              category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "netlify.com",             category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "render.com",              category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "railway.app",             category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "fly.io",                  category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "digitalocean.com",        category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "hostvds.com",             category: "Work",          weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "cloudflare.com",          category: "Work",          weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "supabase.com",            category: "Work",          weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "firebase.google.com",     category: "Work",          weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "console.firebase.google.com", category: "Work",      weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "aws.amazon.com",          category: "Work",          weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "console.aws.amazon.com",  category: "Work",          weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "cloud.google.com",        category: "Work",          weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "console.cloud.google.com", category: "Work",         weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "portal.azure.com",        category: "Work",          weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "stripe.com",              category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "notion.so",               category: "Work",          weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "linear.app",              category: "Work",          weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "trello.com",              category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "asana.com",               category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "clickup.com",             category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "atlassian.net",           category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "calendar.google.com",     category: "Work",          weight: 0.8,  priority: 12 },
  { matchType: "domain", pattern: "mail.google.com",         category: "Work",          weight: 0.5,  priority: 10 },
  { matchType: "domain", pattern: "docs.google.com",         category: "Work",          weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "sheets.google.com",       category: "Work",          weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "outlook.live.com",        category: "Work",          weight: 0.5,  priority: 10 },
  { matchType: "domain", pattern: "outlook.office.com",      category: "Work",          weight: 0.5,  priority: 10 },
  { matchType: "domain", pattern: "slack.com",               category: "Work",          weight: 0.3,  priority: 10 },
  { matchType: "domain", pattern: "teams.microsoft.com",     category: "Work",          weight: 0.3,  priority: 10 },
  { matchType: "domain", pattern: "console.groq.com",        category: "Work",          weight: 0.8,  priority: 12 },
  { matchType: "domain", pattern: "groq.com",                category: "Work",          weight: 0.7,  priority: 10 },

  // Learning - docs, courses, AI assistants, assessments, programming Q&A.
  { matchType: "domain", pattern: "stackoverflow.com",       category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "stackexchange.com",       category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "developer.mozilla.org",   category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "devdocs.io",              category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "w3schools.com",           category: "Learning",      weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "freecodecamp.org",        category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "codecademy.com",          category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "coursera.org",            category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "udemy.com",               category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "edx.org",                 category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "docs.python.org",         category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "nodejs.org",              category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "rust-lang.org",           category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "react.dev",               category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "nextjs.org",              category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "typescriptlang.org",      category: "Learning",      weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "crates.io",               category: "Learning",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "npmjs.com",               category: "Learning",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "pypi.org",                category: "Learning",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "chatgpt.com",             category: "Learning",      weight: 0.8,  priority: 11 },
  { matchType: "domain", pattern: "claude.ai",               category: "Learning",      weight: 0.8,  priority: 11 },
  { matchType: "domain", pattern: "perplexity.ai",           category: "Learning",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "hackerrank.com",          category: "Learning",      weight: 0.9,  priority: 12 },
  { matchType: "domain", pattern: "candidatesupport.hackerrank.com", category: "Learning", weight: 0.9, priority: 12 },
  { matchType: "domain", pattern: "leetcode.com",            category: "Learning",      weight: 0.9,  priority: 10 },
  { matchType: "domain", pattern: "google.com",              category: "Learning",      weight: 0.4,  priority: 5  },

  // Career - employment outcomes and job-search infrastructure.
  { matchType: "domain", pattern: "indeed.com",              category: "Career",        weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "glassdoor.com",           category: "Career",        weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "monster.com",             category: "Career",        weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "ziprecruiter.com",        category: "Career",        weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "greenhouse.io",           category: "Career",        weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "lever.co",                category: "Career",        weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "wellfound.com",           category: "Career",        weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "workdayjobs.com",         category: "Career",        weight: 1.0,  priority: 10 },
  { matchType: "domain", pattern: "myworkdayjobs.com",       category: "Career",        weight: 1.0,  priority: 10 },

  // Business - finance, banking, entrepreneurship, and company operations.
  { matchType: "domain", pattern: "grey.co",                 category: "Business",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "quickbooks.intuit.com",   category: "Business",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "xero.com",                category: "Business",      weight: 0.8,  priority: 10 },
  { matchType: "domain", pattern: "wise.com",                category: "Business",      weight: 0.7,  priority: 10 },
  { matchType: "domain", pattern: "paypal.com",              category: "Business",      weight: 0.6,  priority: 10 },

  // Religion.
  { matchType: "domain", pattern: "biblegateway.com",        category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "bible.com",               category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "youversion.com",          category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "biblehub.com",            category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "openbible.info",          category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "blueletterbible.org",     category: "Religion",      weight: 1.0,  priority: 12 },
  { matchType: "domain", pattern: "gotquestions.org",        category: "Religion",      weight: 0.9,  priority: 10 },

  // Social.
  { matchType: "domain", pattern: "discord.com",             category: "Social",        weight: -0.3, priority: 10 },
  { matchType: "domain", pattern: "twitter.com",             category: "Social",        weight: -0.6, priority: 10 },
  { matchType: "domain", pattern: "x.com",                   category: "Social",        weight: -0.6, priority: 10 },
  { matchType: "domain", pattern: "facebook.com",            category: "Social",        weight: -0.7, priority: 10 },
  { matchType: "domain", pattern: "instagram.com",           category: "Social",        weight: -0.8, priority: 10 },
  { matchType: "domain", pattern: "tiktok.com",              category: "Social",        weight: -1.0, priority: 10 },

  // Entertainment (fixed-content services only).
  { matchType: "domain", pattern: "netflix.com",             category: "Entertainment", weight: -1.0, priority: 10 },
  { matchType: "domain", pattern: "twitch.tv",               category: "Entertainment", weight: -0.8, priority: 10 },
  { matchType: "domain", pattern: "spotify.com",             category: "Entertainment", weight: 0.0,  priority: 10 },
  { matchType: "domain", pattern: "open.spotify.com",        category: "Entertainment", weight: 0.0,  priority: 10 },
  { matchType: "domain", pattern: "hulu.com",                category: "Entertainment", weight: -1.0, priority: 10 },
  { matchType: "domain", pattern: "disneyplus.com",          category: "Entertainment", weight: -1.0, priority: 10 },
  { matchType: "domain", pattern: "primevideo.com",          category: "Entertainment", weight: -1.0, priority: 10 },
];

/** Extract registrable domain (eTLD+1-ish) from a URL string. */
export function parseDomain(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host) return null;
    if (host === "localhost") return host;
    return host.replace(/^(www|m|mobile)\./, "");
  } catch {
    return null;
  }
}
