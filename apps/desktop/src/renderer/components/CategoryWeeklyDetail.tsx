import { useEffect, useMemo, useState } from "react";
import type { CategoryHealth, PeriodBreakdown, PlanNote } from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";

interface Props {
  category: CategoryHealth;
  breakdown: PeriodBreakdown;
  weekStart: string;
  weekEnd: string;
  onClose: () => void;
}

interface TaskLine {
  text: string;
  completed: boolean;
  date: string;
}

function extractTasks(notes: PlanNote[]): TaskLine[] {
  const out: TaskLine[] = [];
  for (const note of notes) {
    for (const line of note.body.split(/\r?\n/)) {
      const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/);
      if (!m) continue;
      const text = m[2];
      if (!text) continue;
      out.push({
        text,
        completed: m[1]?.toLowerCase() === "x",
        date: note.date,
      });
    }
  }
  return out;
}

function noteEvidence(notes: PlanNote[]): string[] {
  const out: string[] = [];
  for (const note of notes) {
    for (const line of note.body.split(/\r?\n/)) {
      const clean = line.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?/, "").trim();
      if (!clean || clean.startsWith("#")) continue;
      if (!out.includes(clean)) out.push(clean);
    }
  }
  return out.slice(0, 12);
}

export function CategoryWeeklyDetail({
  category,
  breakdown,
  weekStart,
  weekEnd,
  onClose,
}: Props) {
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.planNotes(category.category, 1000).then((all) => {
      if (cancelled) return;
      setNotes(all.filter((n) => n.date >= weekStart && n.date <= weekEnd));
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [category.category, weekStart, weekEnd]);

  const tasks = useMemo(() => extractTasks(notes), [notes]);
  const evidence = useMemo(() => noteEvidence(notes), [notes]);

  const byCategory = breakdown.byCategory.find((b) => b.key === category.category);
  const apps = breakdown.byApp.filter((b) => b.category === category.category).slice(0, 6);
  const projects = breakdown.byProject.filter((b) => b.category === category.category).slice(0, 6);
  const completed = tasks.filter((t) => t.completed);
  const open = tasks.filter((t) => !t.completed);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 cursor-pointer"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl cursor-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-category-detail-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-4">
          <div>
            <h2 id="weekly-category-detail-title" className="text-lg font-semibold">{category.category}</h2>
            <p className="text-xs text-subtle mt-0.5">{weekStart} → {weekEnd}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-subtle hover:text-text px-2 py-1">Close</button>
        </header>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Tracked" value={formatDuration(category.actualMs)} />
            <Metric label="Completed" value={String(completed.length)} />
            <Metric label="Open" value={String(open.length)} />
            <Metric label="Notes" value={String(notes.length)} />
          </div>

          <section>
            <h3 className="text-sm font-medium mb-3">Tasks this week</h3>
            {loading ? <p className="text-sm text-subtle">Loading notes…</p> : tasks.length === 0 ? (
              <p className="text-sm text-faint">No checkbox tasks were recorded for this category this week.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((t, i) => (
                  <div key={`${t.date}-${i}`} className="flex items-start gap-3 rounded-lg border border-border bg-bg/30 px-3 py-2">
                    <span className={t.completed ? "text-good" : "text-warn"}>{t.completed ? "✓" : "○"}</span>
                    <div className="min-w-0 flex-1">
                      <div className={t.completed ? "text-sm text-muted line-through" : "text-sm text-text"}>{t.text}</div>
                      <div className="text-[11px] text-faint mt-0.5">{t.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium mb-3">What your notes say</h3>
            {evidence.length === 0 ? <p className="text-sm text-faint">No additional note evidence.</p> : (
              <ul className="space-y-1.5 text-sm text-muted">
                {evidence.map((x, i) => <li key={`${x}-${i}`} className="pl-3 border-l-2 border-border">{x}</li>)}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Breakdown title="Tracked activity" items={apps.length ? apps : byCategory ? [byCategory] : []} />
            <Breakdown title="Projects" items={projects} />
          </div>

          <section>
            <h3 className="text-sm font-medium mb-3">Raw note history</h3>
            {notes.length === 0 ? <p className="text-sm text-faint">No notes recorded.</p> : (
              <div className="space-y-4">
                {notes.map((n) => (
                  <article key={n.id}>
                    <div className="text-xs text-subtle mb-1">{n.date}</div>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-muted rounded-lg bg-bg/30 border border-border px-3 py-2">{n.body}</pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-bg/30 px-3 py-3"><div className="text-[11px] uppercase tracking-wider text-faint">{label}</div><div className="mt-1 text-xl font-semibold tabular-nums">{value}</div></div>;
}

function Breakdown({ title, items }: { title: string; items: { key: string; durationMs: number }[] }) {
  return <section><h3 className="text-sm font-medium mb-3">{title}</h3>{items.length === 0 ? <p className="text-sm text-faint">No matching activity.</p> : <div className="space-y-2">{items.map((b) => <div key={b.key} className="flex justify-between text-sm"><span className="text-muted truncate pr-4">{b.key}</span><span className="tabular-nums text-text">{formatDuration(b.durationMs)}</span></div>)}</div>}</section>;
}
