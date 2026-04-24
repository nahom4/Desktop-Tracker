import { useEffect, useState } from "react";
import type { ActivityEvent, DailyReport } from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { ScoreCard } from "../components/ScoreCard";
import { BreakdownList } from "../components/BreakdownList";
import { TimelineStrip } from "../components/TimelineStrip";
import { ExportMenu } from "../components/ExportMenu";
import { StormList } from "../components/StormList";
import { HealthBars } from "../components/HealthBars";
import { LiveDailyReviewCard } from "../components/AiReviewCard";
import { formatDuration } from "../lib/format";

const DAY_MS = 86_400_000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function Today() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [r, ev] = await Promise.all([
          api.dailyReport(Date.now()),
          api.eventsInRange(startOfToday(), startOfToday() + DAY_MS),
        ]);
        if (cancelled) return;
        setReport((prev) => ({
          ...r,
          aiReview: r.aiReview ?? prev?.aiReview,
        }));
        setEvents(ev);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading && !report) {
    return (
      <div className="p-8 text-slate-500 text-sm">Loading today's activity...</div>
    );
  }

  if (!report) {
    return <div className="p-8 text-slate-500 text-sm">No data yet.</div>;
  }

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-slate-500 mt-1">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400">
            <span className="text-slate-200 tabular-nums">
              {formatDuration(report.totalActiveMs)}
            </span>{" "}
            active -{" "}
            <span className="text-slate-500 tabular-nums">
              {formatDuration(report.totalIdleMs)}
            </span>{" "}
            idle
          </div>
          <ExportMenu baseName={`daily-${report.date}`} />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard
          label="Productivity"
          value={report.productivityScore}
          sub={
            report.productivityQuality != null && report.activeRatio != null
              ? `${report.productivityQuality}% quality on active time - ${Math.round(report.activeRatio * 100)}% of productive target covered`
              : report.productivityTip
          }
        />
        <ScoreCard
          label="Focus"
          value={report.focusScore}
          sub={report.focusTip}
        />
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Active time
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums text-slate-100">
            {formatDuration(report.totalActiveMs)}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {formatDuration(report.totalIdleMs)} idle / locked
          </div>
        </div>
      </div>

      {report.oneChange && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/90">
          {report.oneChange}
        </div>
      )}

      <LiveDailyReviewCard
        review={report.aiReview}
        onRefreshed={(next) =>
          setReport((r) => (r ? { ...r, aiReview: next } : r))
        }
      />

      <HealthBars
        title="Health by category - today"
        health={report.health ?? []}
        period="day"
      />

      <TimelineStrip
        events={events}
        periodStart={startOfToday()}
        periodEnd={startOfToday() + DAY_MS}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownList title="By app" buckets={report.breakdown.byApp} />
        <BreakdownList title="By category" buckets={report.breakdown.byCategory} />
        <BreakdownList
          title="By project"
          buckets={report.breakdown.byProject}
          emptyMessage="No project detected yet - open a folder in your IDE."
        />
        <BreakdownList
          title="By website"
          buckets={report.breakdown.byDomain}
          emptyMessage="No website activity recorded yet - browse with Chrome or Edge in the foreground."
        />
      </div>

      <BreakdownList
        title="By browser profile"
        buckets={report.breakdown.byBrowserProfile}
        emptyMessage="No browser profile data yet - URLs are tagged per Chrome/Edge profile automatically."
      />

      <StormList storms={report.storms ?? []} />
    </div>
  );
}
