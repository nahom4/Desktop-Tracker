import { useEffect, useState } from "react";
import type { WeeklyReport } from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { ScoreCard } from "../components/ScoreCard";
import { BreakdownList } from "../components/BreakdownList";
import { ExportMenu } from "../components/ExportMenu";
import { StormList } from "../components/StormList";
import { HealthBars } from "../components/HealthBars";
import { LiveWeeklyReviewCard } from "../components/AiReviewCard";
import { formatDuration } from "../lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function Weekly() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .weeklyReport(Date.now())
      .then((r) => {
        if (!cancelled) {
          setReport((prev) => ({
            ...r,
            aiReview: r.aiReview ?? prev?.aiReview,
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500 text-sm">Loading weekly report…</div>;
  }
  if (!report) {
    return <div className="p-8 text-slate-500 text-sm">No data yet.</div>;
  }

  const chartData = report.perDay.map((d) => ({
    date: d.date.slice(5),
    productivity: d.productivityScore,
    focus: d.focusScore,
    activeH: Math.round((d.totalActiveMs / 3_600_000) * 10) / 10,
  }));

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly report</h1>
          <p className="text-sm text-slate-500 mt-1">
            {report.weekStart} → {report.weekEnd}
          </p>
        </div>
        <ExportMenu baseName={`weekly-${report.weekStart}`} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreCard
          label="Avg productivity"
          value={report.averageProductivityScore}
          delta={report.productivityScoreDelta}
          sub={report.productivityTip ?? "Steady week."}
        />
        <ScoreCard
          label="Avg focus"
          value={report.averageFocusScore}
          delta={report.focusScoreDelta}
          sub={report.focusTip}
        />
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            Active this week
          </div>
          <div className="mt-2 text-4xl font-semibold tabular-nums">
            {formatDuration(report.totalActiveMs)}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {formatDuration(report.totalIdleMs)} idle / locked
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-4">Per-day scores</h3>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: "#0b1220",
                  border: "1px solid #1f2937",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="productivity" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="focus" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Productivity
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" /> Focus
          </span>
        </div>
      </div>

      <LiveWeeklyReviewCard
        review={report.aiReview}
        onRefreshed={(next) =>
          setReport((r) => (r ? { ...r, aiReview: next } : r))
        }
      />

      <HealthBars
        title="Health by category — this week"
        health={report.health ?? []}
        period="week"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownList title="By category" buckets={report.breakdown.byCategory} />
        <BreakdownList title="By app" buckets={report.breakdown.byApp} />
        <BreakdownList title="By project" buckets={report.breakdown.byProject} />
        <BreakdownList
          title="Top distractions"
          buckets={report.topDistractions}
          emptyMessage="Nothing flagged as a top distraction this week."
        />
      </div>

      <StormList storms={report.storms ?? []} />
    </div>
  );
}
