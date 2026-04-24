/**
 * AI classifier — semantically labels foreground events into the user's
 * own taxonomy (Work / Religion / Learning / Business / …).
 *
 * Design notes:
 *  - Uses a capable model (70B default). The old 8B "instant" model was the
 *    main source of mislabels (neutral guesses, wrong Work/Learning splits).
 *  - Small batches + structured prompt + few-shots beat domain-rule fallbacks.
 *  - Low-confidence AI output is discarded (not persisted) so rules apply
 *    until the model is sure.
 */

import type {
  ActivityEvent,
  Category,
  NewEventTag,
} from "@desktop-tracker/shared";
import { LEGACY_CATEGORY_MAP } from "@desktop-tracker/defaults";
import {
  findEventsNeedingAi,
  getSetting,
  insertEventTags,
  listCategories,
} from "./db";

const TICK_MS = 60 * 60 * 1000;
const BATCH_SIZE = 10;
const MIN_AGE_MS = 30_000;
/** Stronger than 8b-instant — accuracy matters more than latency for tagging. */
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
/** Tags below this are not stored — avoids locking in guesses. */
const MIN_CONFIDENCE_TO_PERSIST = 0.65;

let fastClassifyTimer: NodeJS.Timeout | null = null;

interface ClassifierState {
  timer: NodeJS.Timeout | null;
  running: boolean;
  lastRunAt: number | null;
  lastTagged: number;
  lastError: string | null;
}

const state: ClassifierState = {
  timer: null,
  running: false,
  lastRunAt: null,
  lastTagged: 0,
  lastError: null,
};

export function scheduleFastClassification(): void {
  if (fastClassifyTimer) clearTimeout(fastClassifyTimer);
  fastClassifyTimer = setTimeout(() => {
    fastClassifyTimer = null;
    void runOnce().then((r) => {
      if (r.tagged > 0) console.log(`[ai] fast-path tagged ${r.tagged}`);
    });
  }, 8_000);
}

export function startAiClassifier(): void {
  if (state.timer) return;
  state.timer = setTimeout(function loop() {
    void runOnce().finally(() => {
      state.timer = setTimeout(loop, TICK_MS);
    });
  }, 60_000);
  console.log("[ai] classifier scheduled (hourly)");
}

export function stopAiClassifier(): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

export function getAiStatus(): {
  enabled: boolean;
  hasKey: boolean;
  running: boolean;
  lastRunAt: number | null;
  lastTagged: number;
  lastError: string | null;
} {
  const key = resolveApiKey();
  const enabledRaw = getSetting("ai_tagging_enabled");
  const enabled = enabledRaw === null ? Boolean(key) : enabledRaw === "1";
  return {
    enabled,
    hasKey: Boolean(key),
    running: state.running,
    lastRunAt: state.lastRunAt,
    lastTagged: state.lastTagged,
    lastError: state.lastError,
  };
}

/** Run batches until the AI queue is empty (cap prevents runaway API use). */
export async function runUntilCaughtUp(maxBatches = 30): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const r = await runOnce();
    if (r.tagged === 0) break;
    total += r.tagged;
  }
  if (total > 0) console.log(`[ai] catch-up tagged ${total} events`);
  return total;
}

export async function runOnce(): Promise<{ tagged: number; reason?: string }> {
  if (state.running) return { tagged: 0, reason: "already running" };
  state.running = true;
  try {
    const key = resolveApiKey();
    if (!key) return { tagged: 0, reason: "no api key" };

    const enabledRaw = getSetting("ai_tagging_enabled");
    if (enabledRaw === "0") return { tagged: 0, reason: "disabled" };

    const categories = listCategories();
    if (categories.length === 0) return { tagged: 0, reason: "no categories" };

    const events = findEventsNeedingAi(MIN_AGE_MS, BATCH_SIZE);
    if (events.length === 0) {
      state.lastRunAt = Date.now();
      state.lastTagged = 0;
      return { tagged: 0, reason: "queue empty" };
    }

    const { unique, eventToKey } = dedupe(events);
    const model = getSetting("ai_model") || DEFAULT_MODEL;
    const validNames = new Set(
      categories.filter((c) => c.name !== "Unclassified").map((c) => c.name)
    );

    const classifications = await classifyBatch({
      key,
      model,
      categories,
      items: unique,
      validNames,
    });

    const tags: NewEventTag[] = [];
    for (const ev of events) {
      const k = eventToKey.get(ev.id)!;
      const r = classifications.get(k);
      if (!r) continue;
      tags.push({
        eventId: ev.id,
        category: r.category,
        source: "ai",
        confidence: r.confidence,
        model,
      });
    }
    const inserted = insertEventTags(tags);
    state.lastRunAt = Date.now();
    state.lastTagged = inserted;
    state.lastError = null;
    console.log(`[ai] tagged ${inserted} events (${unique.length} unique, model=${model})`);
    return { tagged: inserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.lastError = msg;
    console.error("[ai] classifier failed:", msg);
    return { tagged: 0, reason: msg };
  } finally {
    state.running = false;
  }
}

function resolveApiKey(): string | null {
  const fromEnv = process.env.GROQ_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const fromDb = getSetting("groq_api_key");
  return fromDb && fromDb.trim() ? fromDb.trim() : null;
}

interface BatchItem {
  key: string;
  app: string;
  domain: string | null;
  url: string | null;
  title: string | null;
  project: string | null;
  durationSec: number;
}

function dedupe(events: readonly ActivityEvent[]): {
  unique: BatchItem[];
  eventToKey: Map<number, string>;
} {
  const eventToKey = new Map<number, string>();
  const uniqMap = new Map<string, BatchItem>();
  for (const ev of events) {
    const title = (ev.title ?? "").trim().slice(0, 220);
    const domain = ev.domain ?? null;
    const base = domain ?? ev.exe;
    const key = `${base}|${title.toLowerCase()}`;
    eventToKey.set(ev.id, key);
    if (!uniqMap.has(key)) {
      uniqMap.set(key, {
        key,
        app: ev.exe,
        domain,
        url: ev.url,
        title: ev.title,
        project: ev.project,
        durationSec: Math.round(ev.durationMs / 1000),
      });
    }
  }
  return { unique: [...uniqMap.values()], eventToKey };
}

interface AiResult {
  category: string;
  confidence: number;
}

function normalizeAiCategory(
  raw: string,
  validNames: ReadonlySet<string>
): string | null {
  const trimmed = raw.trim();
  if (trimmed === "Other" || trimmed === "Unclassified") return null;
  if (validNames.has(trimmed)) return trimmed;
  for (const n of validNames) {
    if (n.toLowerCase() === trimmed.toLowerCase()) return n;
  }
  const mapped = LEGACY_CATEGORY_MAP[trimmed];
  if (mapped && validNames.has(mapped)) return mapped;
  return null;
}

async function classifyBatch(args: {
  key: string;
  model: string;
  categories: Category[];
  items: BatchItem[];
  validNames: ReadonlySet<string>;
}): Promise<Map<string, AiResult>> {
  const { key, model, categories, items, validNames } = args;

  const taxonomy = categories
    .filter((c) => c.name !== "Unclassified")
    .map((c, i) => `${i + 1}. ${c.name}: ${c.description || "(no description)"}`)
    .join("\n");

  const numbered = items
    .map((it, i) => {
      const parts: string[] = [
        `#${i + 1}`,
        `app=${it.app}`,
        `duration=${it.durationSec}s`,
      ];
      if (it.domain) parts.push(`domain=${it.domain}`);
      if (it.url) parts.push(`url=${JSON.stringify(it.url.slice(0, 400))}`);
      if (it.project) parts.push(`project=${it.project}`);
      if (it.title) parts.push(`title=${JSON.stringify(it.title)}`);
      return parts.join(" ");
    })
    .join("\n");

  const system = [
    "You classify desktop activity into the user's categories.",
    "Reply ONLY with strict JSON.",
    "",
    "CRITICAL — Work vs Learning (most common mistake):",
    "- Learning: studying, tutorials, docs, courses, practice problems",
    "  (HackerRank, LeetCode, Stack Overflow), AI assistants used to learn or",
    "  debug study/personal projects (ChatGPT, Claude, Perplexity).",
    "- Work: paid employment, employer calendar/email, client deliverables,",
    "  shipping production code, API/cloud consoles (console.groq.com, AWS,",
    "  Vercel dashboard), work Slack/Teams.",
    "  Also Work: source-control repos and hosting/cloud/devops dashboards",
    "  such as Azure, GCP, Vercel, Netlify, Render, Railway, Fly.io,",
    "  DigitalOcean, Cloudflare, Supabase, and Firebase.",
    "- Career: job search, resumes/CV, interview preparation, recruiter",
    "  messages, portfolio polishing, compensation research, and LinkedIn used",
    "  for employment outcomes.",
    "- Religion: Bible/Quran/scripture sites, BibleGateway, YouVersion, sermons,",
    "  devotionals, theology, and religious study.",
    "",
    "Domain anchors (override only if title/URL clearly contradict):",
    "- source-control, cloud/devops dashboards, calendar, and email -> Work",
    "- docs, course platforms, coding Q&A, AI assistants, HackerRank/LeetCode -> Learning",
    "- job boards and applicant tracking systems -> Career",
    "- scripture/religious study sites -> Religion",
    "- chatgpt.com, claude.ai, perplexity.ai → Learning",
    "- hackerrank.com, leetcode.com, stackoverflow.com → Learning",
    "- console.groq.com, calendar.google.com, mail.google.com → Work",
    "- youtube.com / reddit.com / linkedin.com → judge ONLY from title + URL.",
    "  Coding tutorials, docs, courses → Learning.",
    "  Passive hustle content (viral growth tips, get-rich-quick, podcast clips,",
    '  "I make $X/month" interviews, motivational business YouTube) → Entertainment,',
    "  NOT Business — Business is for work you are actively doing (building, selling,",
    "  planning), not watching someone talk about money.",
    "",
    "Never output Unclassified. Pick the closest category. Use confidence 0.5-0.7",
    "when genuinely unsure, 0.8+ when domain + title agree.",
  ].join("\n");

  const user = [
    "Categories:",
    taxonomy,
    "",
    "Few-shot examples:",
    '#1 app=chrome.exe domain=chatgpt.com title="React useEffect fix" → Learning, 0.88',
    '#2 app=chrome.exe domain=console.groq.com title="GroqCloud" → Work, 0.86',
    '#3 app=chrome.exe domain=candidatesupport.hackerrank.com title="HackerRank Test" → Learning, 0.92',
    '#4 app=chrome.exe domain=calendar.google.com title="Google Calendar" → Work, 0.9',
    '#5 app=chrome.exe domain=youtube.com title="MERN stack full course" url=/watch?v=abc → Learning, 0.87',
    '#6 app=chrome.exe domain=youtube.com title="Going Viral Isn\'t Luck — I Make $1M/Month With Short Videos" → Entertainment, 0.88',
    '#7 app=chrome.exe domain=youtube.com title="Joe Rogan podcast highlights" → Entertainment, 0.9',
  "",
    '#8 app=chrome.exe domain=linkedin.com title="Software Engineer jobs" -> Career, 0.9',
    '#9 app=chrome.exe domain=indeed.com title="Frontend developer roles" -> Career, 0.9',
    "Activities to classify:",
    numbered,
    "",
    `Valid names: ${[...validNames].join(", ")}.`,
    'JSON: {"results":[{"i":1,"category":"<name>","confidence":0.85}, ...]}',
    "One entry per activity, same order. confidence is 0..1.",
  ].join("\n");

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${body.slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  let parsed: { results?: { i: number; category: string; confidence?: number }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Groq returned non-JSON: ${content.slice(0, 240)}`);
  }

  const out = new Map<string, AiResult>();
  const results = parsed.results ?? [];
  if (results.length !== items.length) {
    console.warn(
      `[ai] model returned ${results.length} results for ${items.length} items`
    );
  }

  for (const r of results) {
    const idx = (r.i ?? 0) - 1;
    const item = items[idx];
    if (!item) continue;
    const category = normalizeAiCategory(String(r.category), validNames);
    if (!category) {
      console.warn(`[ai] dropped invalid category "${r.category}" for ${item.domain ?? item.app}`);
      continue;
    }
    const confidence = clamp01(Number(r.confidence ?? 0));
    if (confidence < MIN_CONFIDENCE_TO_PERSIST) {
      console.warn(
        `[ai] dropped low-confidence ${category} (${confidence}) for ${item.domain ?? item.app}`
      );
      continue;
    }
    out.set(item.key, { category, confidence });
  }
  return out;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Kept for any legacy imports — semantic domains use fast-path scheduling only.
export const AMBIGUOUS_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "reddit.com",
]);

export function isAmbiguousDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^(www|m|mobile)\./, "");
  return AMBIGUOUS_DOMAINS.has(d);
}
