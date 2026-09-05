import { useEffect, useMemo, useState } from "react";
import type { Category, PlanNote, ScheduleNowStatus } from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { CategoryPlanPanel } from "../components/CategoryPlanPanel";

/**
 * Notes, per category.
 *
 * The list is today's plan — the categories actually in play — rather than
 * every category that exists. Anything with history but not on today's plan is
 * still reachable below, so old notes never become unreadable.
 */
export function Notes() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [now, setNow] = useState<ScheduleNowStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [cats, allNotes, status] = await Promise.all([
      api.categoriesList(),
      api.planNotes(),
      api.scheduleNow().catch(() => null),
    ]);
    setCategories(cats);
    setNotes(allNotes);
    setNow(status);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  /** Categories on today's schedule, in the order the day runs. */
  const todayCategories = useMemo(() => {
    const out: string[] = [];
    for (const b of now?.today.blocks ?? []) {
      if (!out.includes(b.block.category)) out.push(b.block.category);
    }
    return out;
  }, [now]);

  /** Has notes but is not on today's plan — kept reachable, listed separately. */
  const otherCategories = useMemo(() => {
    const out: string[] = [];
    for (const n of notes) {
      if (!todayCategories.includes(n.category) && !out.includes(n.category)) {
        out.push(n.category);
      }
    }
    return out.sort();
  }, [notes, todayCategories]);

  const active = selected ?? todayCategories[0] ?? otherCategories[0] ?? null;

  const visibleNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => n.category === active)
      .filter((n) => !q || n.body.toLowerCase().includes(q) || n.date.includes(q));
  }, [notes, active, query]);

  const colorOf = (name: string) =>
    categories.find((c) => c.name === name)?.color ?? "#64748b";

  if (loading) {
    return <div className="p-8 text-subtle text-sm">Loading notes…</div>;
  }

  const navButton = (name: string, dim = false) => {
    const count = notes.filter((n) => n.category === name).length;
    const isActive = name === active;
    return (
      <button
        key={name}
        onClick={() => setSelected(name)}
        className={
          "w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors " +
          (isActive
            ? "bg-elevate text-text"
            : (dim ? "text-subtle" : "text-muted") +
              " hover:text-text hover:bg-elevate/60")
        }
      >
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: colorOf(name) }}
        />
        <span className="flex-1 truncate">{name}</span>
        {count > 0 && (
          <span className="text-xs text-faint tabular-nums">{count}</span>
        )}
      </button>
    );
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="text-sm text-subtle mt-1">
          One markdown document per category, per day.
        </p>
      </header>

      {!active ? (
        <p className="text-sm text-subtle">
          Nothing scheduled today, so there is no category in play. Add blocks on
          the Schedule page, or write against the current block on Today.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-6">
          <nav className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-faint px-3 pb-1">
              Today
            </div>
            {todayCategories.map((n) => navButton(n))}
            {todayCategories.length === 0 && (
              <p className="px-3 text-xs text-faint">Nothing scheduled.</p>
            )}

            {otherCategories.length > 0 && (
              <>
                <div className="text-xs uppercase tracking-wider text-faint px-3 pt-4 pb-1">
                  Earlier
                </div>
                {otherCategories.map((n) => navButton(n, true))}
              </>
            )}
          </nav>

          <div className="space-y-5 min-w-0">
            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <h3 className="text-sm font-medium text-text mb-3">{active}</h3>
              <CategoryPlanPanel category={active} />
            </section>

            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <div className="flex items-baseline justify-between gap-4 mb-3">
                <h3 className="text-sm font-medium text-text">History</h3>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes…"
                  className="bg-bg/60 border border-border rounded px-2 py-1 text-xs text-text placeholder:text-faint focus:outline-none focus:border-border-strong"
                />
              </div>
              {visibleNotes.length === 0 ? (
                <p className="text-sm text-faint">
                  {query ? "No notes match that search." : "No entries yet."}
                </p>
              ) : (
                <ol className="space-y-4">
                  {visibleNotes.map((n) => (
                    <li key={n.id} className="group">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs tabular-nums text-subtle">
                          {n.date}
                        </span>
                        <button
                          onClick={async () => {
                            await api.planNoteDelete(n.id);
                            await load();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-xs text-faint hover:text-bad transition-opacity"
                        >
                          delete
                        </button>
                      </div>
                      <pre className="mt-1 text-sm text-text whitespace-pre-wrap font-sans border-l-2 border-border pl-3">
                        {n.body}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
