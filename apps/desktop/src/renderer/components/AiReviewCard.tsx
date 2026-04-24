import { useState } from "react";
import type { AiReview } from "@desktop-tracker/shared";
import { api } from "../lib/api";

interface AiReviewCardProps {
  review: AiReview | null | undefined;
  onGenerate?: () => Promise<void>;
  generatable?: boolean;
  period: "daily" | "weekly";
}

export function AiReviewCard({
  review,
  onGenerate,
  generatable = true,
  period,
}: AiReviewCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!onGenerate || busy) return;
    setError(null);
    setBusy(true);
    try {
      await onGenerate();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
          ? e
          : "Failed to generate review.";
      setError(msg);
      console.error("[AiReviewCard]", e);
    } finally {
      setBusy(false);
    }
  };

  if (!review) {
    return (
      <div className="rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-violet-500/5 p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-sky-200">AI review</h3>
            <p className="text-sm text-slate-400 mt-1">
              {busy
                ? "Calling Groq (llama-3.3-70b) — usually 5–15 seconds…"
                : generatable
                ? "Generate a narrative analysis of the period using your taxonomy."
                : "No AI review on this saved report."}
            </p>
            {error && (
              <p className="text-sm text-rose-300 mt-2 leading-relaxed">{error}</p>
            )}
          </div>
          {generatable && (
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              data-export-chrome
              className="px-3 py-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20 text-sm disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {busy ? "Thinking…" : "Generate now"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-medium text-sky-200">
          AI review — {period === "daily" ? "today" : "this week"}
        </h3>
        <div className="flex items-center gap-2 text-xs text-slate-500" data-export-chrome>
          <span className="font-mono">{review.model}</span>
          {generatable && (
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Thinking…" : "Regenerate"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-rose-300 border border-rose-500/30 rounded-md px-3 py-2 bg-rose-500/5">
          {error}
        </p>
      )}

      {busy && (
        <p className="text-sm text-sky-200/80 animate-pulse">
          Regenerating review…
        </p>
      )}

      <p className="text-base text-slate-100 leading-relaxed">
        {review.summary || "(no summary)"}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Block label="Wins" tint="emerald" items={review.wins} />
        <Block label="Misses" tint="rose" items={review.misses} />
      </div>

      {review.recommendation && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-300 mb-1">
            Do this tomorrow
          </div>
          <div className="text-sm text-slate-100">{review.recommendation}</div>
        </div>
      )}

      {review.notes && (
        <details className="text-sm text-slate-400">
          <summary className="cursor-pointer text-slate-300 hover:text-slate-200 select-none">
            Notes
          </summary>
          <p className="mt-2 leading-relaxed whitespace-pre-wrap">{review.notes}</p>
        </details>
      )}

      <div className="text-xs text-slate-500">
        Generated{" "}
        {new Date(review.generatedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

function Block({
  label,
  tint,
  items,
}: {
  label: string;
  tint: "emerald" | "rose";
  items: string[];
}) {
  const colorMap = {
    emerald: { dot: "bg-emerald-400", title: "text-emerald-300" },
    rose: { dot: "bg-rose-400", title: "text-rose-300" },
  } as const;
  const c = colorMap[tint];
  return (
    <div>
      <div className={`text-xs uppercase tracking-wider mb-2 ${c.title}`}>{label}</div>
      {items.length === 0 ? (
        <div className="text-sm text-slate-500">—</div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
              <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LiveDailyReviewCard({
  review,
  onRefreshed,
}: {
  review: AiReview | null | undefined;
  onRefreshed: (next: AiReview | null) => void;
}) {
  return (
    <AiReviewCard
      review={review}
      period="daily"
      onGenerate={async () => {
        if (!api.reviewDailyNow) {
          throw new Error(
            "App needs a restart — reviewDailyNow is missing. Stop and run npm run dev again."
          );
        }
        const r = await api.reviewDailyNow(Date.now());
        if (!r.aiReview) {
          throw new Error(
            "Groq returned no review. Check Settings → AI tagging for your API key."
          );
        }
        onRefreshed(r.aiReview);
      }}
    />
  );
}

export function LiveWeeklyReviewCard({
  review,
  onRefreshed,
}: {
  review: AiReview | null | undefined;
  onRefreshed: (next: AiReview | null) => void;
}) {
  return (
    <AiReviewCard
      review={review}
      period="weekly"
      onGenerate={async () => {
        if (!api.reviewWeeklyNow) {
          throw new Error(
            "App needs a restart — reviewWeeklyNow is missing. Stop and run npm run dev again."
          );
        }
        const r = await api.reviewWeeklyNow(Date.now());
        if (!r.aiReview) {
          throw new Error(
            "Groq returned no review. Check Settings → AI tagging for your API key."
          );
        }
        onRefreshed(r.aiReview);
      }}
    />
  );
}
