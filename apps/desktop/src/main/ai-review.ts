/**
 * AI Review generator — turns a structured daily/weekly report into a short
 * narrative review with concrete wins, misses, and a single recommendation.
 *
 * Runs at end-of-period (scheduler) or on demand from the UI. Uses a stronger
 * model than the per-event tagger (default `llama-3.3-70b-versatile`) since
 * it's called at most a few times per day.
 */

import type {
  AiReview,
  DailyReport,
  WeeklyReport,
} from "@desktop-tracker/shared";
import { getSetting } from "./db";

const REVIEW_MODEL_DEFAULT = "llama-3.3-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function isDaily(r: DailyReport | WeeklyReport): r is DailyReport {
  return (r as DailyReport).date !== undefined;
}

function resolveApiKey(): string | null {
  const fromEnv = process.env.GROQ_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const fromDb = getSetting("groq_api_key");
  return fromDb && fromDb.trim() ? fromDb.trim() : null;
}

function formatDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${String(rem).padStart(2, "0")}m`;
}

/**
 * Build a compact summary string of the report state. We deliberately
 * trim breakdowns to top-N so token cost is bounded regardless of how
 * many events the user generates.
 */
function summarizeReport(r: DailyReport | WeeklyReport): string {
  const lines: string[] = [];
  if (isDaily(r)) {
    lines.push(`Period: daily (${r.date})`);
    lines.push(
      `Productivity score: ${r.productivityScore}/100, Focus: ${r.focusScore}/100`
    );
    lines.push(
      `Active: ${formatDuration(r.totalActiveMs)}, Idle/locked: ${formatDuration(
        r.totalIdleMs
      )}`
    );
    lines.push(
      `Longest focus block: ${formatDuration(r.longestFocusBlockMs)}, Category switches: ${r.contextSwitches}`
    );
  } else {
    lines.push(`Period: weekly (${r.weekStart} → ${r.weekEnd})`);
    lines.push(
      `Avg productivity: ${r.averageProductivityScore}/100 (Δ ${r.productivityScoreDelta >= 0 ? "+" : ""}${r.productivityScoreDelta} vs last week), Avg focus: ${r.averageFocusScore}/100 (Δ ${r.focusScoreDelta >= 0 ? "+" : ""}${r.focusScoreDelta})`
    );
    lines.push(
      `Active total: ${formatDuration(r.totalActiveMs)}, Idle/locked: ${formatDuration(
        r.totalIdleMs
      )}, Deep work: ${r.deepWorkHours}h`
    );
  }

  if (r.health.length > 0) {
    lines.push("Category health (tracked, actual vs target):");
    for (const h of r.health.filter((h) => h.isHealthTracked)) {
      const tgt = h.targetMs ? formatDuration(h.targetMs) : "no target";
      const pct = h.progress !== null ? `${Math.round(h.progress * 100)}%` : "—";
      lines.push(`  - ${h.category}: ${formatDuration(h.actualMs)} / ${tgt} (${pct})`);
    }
  }

  const topCat = r.breakdown.byCategory.slice(0, 6);
  if (topCat.length > 0) {
    lines.push("Top categories:");
    for (const b of topCat) lines.push(`  - ${b.key}: ${formatDuration(b.durationMs)}`);
  }
  const topApp = r.breakdown.byApp.slice(0, 5);
  if (topApp.length > 0) {
    lines.push("Top apps:");
    for (const b of topApp) lines.push(`  - ${b.key}: ${formatDuration(b.durationMs)}`);
  }
  const topDomain = r.breakdown.byDomain.slice(0, 5);
  if (topDomain.length > 0) {
    lines.push("Top websites:");
    for (const b of topDomain) lines.push(`  - ${b.key}: ${formatDuration(b.durationMs)}`);
  }

  if (r.storms.length > 0) {
    lines.push(`Context-switch storms: ${r.storms.length}`);
    const worst = [...r.storms].sort((a, b) => b.totalSwitches - a.totalSwitches)[0]!;
    const startStr = new Date(worst.startTs).toLocaleTimeString();
    const endStr = new Date(worst.endTs).toLocaleTimeString();
    lines.push(
      `  Worst: ${startStr} → ${endStr}, ${worst.totalSwitches} switches (peak ${worst.peakSwitchesPerMin}/min)`
    );
  }

  if (!isDaily(r) && r.topDistractions.length > 0) {
    lines.push("Top distractions this week:");
    for (const b of r.topDistractions.slice(0, 5)) {
      lines.push(`  - ${b.key} (${b.category ?? "?"}): ${formatDuration(b.durationMs)}`);
    }
  }

  return lines.join("\n");
}

const REVIEW_SYSTEM = [
  "You are a brutally honest productivity coach reviewing a user's day or week.",
  "You write 1–2 sentences of summary, then 2-4 wins, 2-4 misses, and exactly one concrete",
  "recommendation. You ground every claim in numbers from the data. You do not flatter.",
  "If the user blew their targets, say so. If their focus shattered, name the time window.",
  "Respect the user's own taxonomy: a YouTube business video is Business, not Entertainment.",
  "Reply ONLY with strict JSON.",
].join(" ");

function buildPrompt(r: DailyReport | WeeklyReport): string {
  return [
    "Data:",
    summarizeReport(r),
    "",
    "Respond with JSON of shape:",
    `{
  "summary": "1-2 sentence headline",
  "wins": ["short bullet", "short bullet"],
  "misses": ["short bullet", "short bullet"],
  "recommendation": "single concrete action for next period",
  "notes": "optional longer narrative or null"
}`,
    "Keep bullets concise (max ~14 words each). Cite specific numbers, apps, sites, or times.",
  ].join("\n");
}

export async function generateAiReview(
  report: DailyReport | WeeklyReport
): Promise<AiReview> {
  const key = resolveApiKey();
  if (!key) {
    throw new Error(
      "No Groq API key configured. Open Settings → AI tagging and save your key."
    );
  }

  const model = getSetting("ai_review_model") || REVIEW_MODEL_DEFAULT;
  const period: AiReview["period"] = isDaily(report) ? "daily" : "weekly";

  const res = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: REVIEW_SYSTEM },
        { role: "user", content: buildPrompt(report) },
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
  let parsed: {
    summary?: string;
    wins?: string[];
    misses?: string[];
    recommendation?: string;
    notes?: string | null;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Groq returned non-JSON review: ${content.slice(0, 240)}`);
  }

  return {
    generatedAt: Date.now(),
    model,
    period,
    summary: String(parsed.summary ?? "").trim(),
    wins: (parsed.wins ?? []).map((s) => String(s)).filter(Boolean).slice(0, 6),
    misses: (parsed.misses ?? []).map((s) => String(s)).filter(Boolean).slice(0, 6),
    recommendation: String(parsed.recommendation ?? "").trim(),
    notes: parsed.notes ? String(parsed.notes).trim() : null,
  };
}
