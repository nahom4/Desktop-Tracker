import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BlockAdherence,
  Category,
  DayOfWeek,
  ResolvedScheduleBlock,
  SchedulePlanWeek,
  ScheduleValidationError,
  ScheduleWeekAdherence,
} from "@desktop-tracker/shared";
import { DAY_SHORT_NAMES } from "@desktop-tracker/shared";
import { formatMinuteOfDay } from "@desktop-tracker/analysis";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import { ScheduleBlockEditor, type EditorTarget } from "../components/ScheduleBlockEditor";

const WEEK_MS = 7 * 86_400_000;

/** Blocks are keyed by their slot: a day never has two blocks at one time. */
function slotKey(date: string, startMin: number, endMin: number): string {
  return `${date}::${startMin}::${endMin}`;
}

export function Schedule() {
  const [weekTs, setWeekTs] = useState(() => Date.now());
  const [plan, setPlan] = useState<SchedulePlanWeek | null>(null);
  const [adherence, setAdherence] = useState<ScheduleWeekAdherence | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a, c] = await Promise.all([
        api.schedulePlan(weekTs),
        api.scheduleWeekAdherence(weekTs),
        api.categoriesList(),
      ]);
      setPlan(p);
      setAdherence(a);
      setCategories(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [weekTs]);

  useEffect(() => {
    void refresh();
    // Adherence for the block in progress moves while you watch it.
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const adherenceBySlot = useMemo(() => {
    const map = new Map<string, BlockAdherence>();
    for (const day of adherence?.perDay ?? []) {
      for (const b of day.blocks) {
        map.set(slotKey(day.date, b.block.startMin, b.block.endMin), b);
      }
    }
    return map;
  }, [adherence]);

  const todayKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  }, []);

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return (
      <div className="p-8 text-subtle text-sm">
        {error ? `Could not load the schedule: ${error}` : "Loading schedule…"}
      </div>
    );
  }

  const rangeLabel = weekRangeLabel(plan.days[0]!.date, plan.days[6]!.date);
  const isThisWeek = plan.days.some((d) => d.date === todayKey);

  return (
    <div className="p-8 space-y-6 max-w-[1600px]">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="text-sm text-subtle mt-1">
            Your repeating weekly plan. Every block is graded against what you
            actually did — the day's ★ most important task counts double.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekTs((t) => t - WEEK_MS)}
            className="px-2.5 py-1.5 rounded-md border border-border text-sm hover:bg-elevate"
            aria-label="Previous week"
          >
            ◀
          </button>
          <div className="text-sm text-text tabular-nums min-w-[13rem] text-center">
            {rangeLabel}
            {isThisWeek && <span className="ml-2 text-xs text-accent">this week</span>}
          </div>
          <button
            onClick={() => setWeekTs((t) => t + WEEK_MS)}
            className="px-2.5 py-1.5 rounded-md border border-border text-sm hover:bg-elevate"
            aria-label="Next week"
          >
            ▶
          </button>
          {!isThisWeek && (
            <button
              onClick={() => setWeekTs(Date.now())}
              className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-elevate"
            >
              Today
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-bad/50 bg-bad-soft/30 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      <WeekSummary adherence={adherence} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 items-start">
        {plan.days.map((day) => (
          <DayColumn
            key={day.date}
            date={day.date}
            dayOfWeek={day.dayOfWeek}
            blocks={day.blocks}
            errors={day.errors}
            isToday={day.date === todayKey}
            adherenceBySlot={adherenceBySlot}
            onAdd={() =>
              setEditing({ mode: "create", date: day.date, dayOfWeek: day.dayOfWeek })
            }
            onEdit={(block) =>
              setEditing({
                mode: "edit",
                date: day.date,
                dayOfWeek: day.dayOfWeek,
                block,
              })
            }
            onRevert={() =>
              void runAction(() => api.scheduleOverrideClearDay(day.date))
            }
          />
        ))}
      </div>

      {editing && (
        <ScheduleBlockEditor
          target={editing}
          categories={categories}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(draft, scope) => void runAction(() => saveBlock(editing, draft, scope))}
          onDelete={(scope) => void runAction(() => deleteBlock(editing, scope))}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- persistence

export interface BlockDraft {
  dayOfWeek: DayOfWeek;
  startMin: number;
  endMin: number;
  title: string;
  category: string;
  isPrimary: boolean;
  notes: string | null;
}

/** "every week" edits the recurring template; "this week" writes a dated exception. */
export type SaveScope = "weekly" | "once";

async function saveBlock(
  target: EditorTarget,
  draft: BlockDraft,
  scope: SaveScope
): Promise<void> {
  const existing = target.mode === "edit" ? target.block : null;

  if (scope === "weekly") {
    if (existing?.blockId != null) {
      await api.scheduleBlockUpdate(existing.blockId, draft);
      // The block now matches the template everywhere, so a stale one-date
      // exception for it would silently undo the edit on that date.
      if (existing.overrideId != null) {
        await api.scheduleOverrideDelete(existing.overrideId);
      }
      return;
    }
    // Promoting a one-off block (or creating a brand new one) into the template.
    if (existing?.overrideId != null) {
      await api.scheduleOverrideDelete(existing.overrideId);
    }
    await api.scheduleBlockCreate(draft);
    return;
  }

  // This week only.
  if (existing?.blockId != null) {
    await api.scheduleOverrideSet({
      date: target.date,
      blockId: existing.blockId,
      kind: "modify",
      startMin: draft.startMin,
      endMin: draft.endMin,
      title: draft.title,
      category: draft.category,
      isPrimary: draft.isPrimary,
      notes: draft.notes,
    });
    return;
  }
  // A one-off block: replace the previous add-override rather than stacking one.
  if (existing?.overrideId != null) {
    await api.scheduleOverrideDelete(existing.overrideId);
  }
  await api.scheduleOverrideSet({
    date: target.date,
    blockId: null,
    kind: "add",
    startMin: draft.startMin,
    endMin: draft.endMin,
    title: draft.title,
    category: draft.category,
    isPrimary: draft.isPrimary,
    notes: draft.notes,
  });
}

async function deleteBlock(target: EditorTarget, scope: SaveScope): Promise<void> {
  if (target.mode !== "edit") return;
  const { block } = target;

  // A block that only exists on this date is simply removed, whatever the scope.
  if (block.blockId == null) {
    if (block.overrideId != null) await api.scheduleOverrideDelete(block.overrideId);
    return;
  }

  if (scope === "weekly") {
    await api.scheduleBlockDelete(block.blockId);
    return;
  }
  await api.scheduleOverrideSet({
    date: target.date,
    blockId: block.blockId,
    kind: "remove",
    startMin: null,
    endMin: null,
    title: null,
    category: null,
    isPrimary: null,
    notes: null,
  });
}

// ------------------------------------------------------------------ subviews

function WeekSummary({ adherence }: { adherence: ScheduleWeekAdherence | null }) {
  if (!adherence) return null;
  const planned = adherence.plannedMs;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SummaryCard
        label="Plan adherence"
        value={adherence.score}
        sub={
          adherence.score === null
            ? "Nothing scheduled has elapsed yet this week."
            : `${formatDuration(adherence.onPlanMs)} on plan of ${formatDuration(
                planned
              )} scheduled`
        }
      />
      <SummaryCard
        label="Most important tasks"
        value={adherence.primaryScore}
        sub={
          adherence.primaryScore === null
            ? "No ★ block has come due yet."
            : "Weighted double in the adherence score."
        }
      />
      <div className="rounded-xl border border-border bg-surface/40 p-5">
        <div className="text-xs uppercase tracking-wider text-subtle">
          Scheduled this week
        </div>
        <div className="mt-2 text-4xl font-semibold tabular-nums text-text">
          {formatDuration(planned)}
        </div>
        <div className="mt-1 text-sm text-muted">
          across {adherence.perDay.filter((d) => d.blocks.length > 0).length} planned days
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="text-xs uppercase tracking-wider text-subtle">{label}</div>
      <div
        className={
          "mt-2 text-4xl font-semibold tabular-nums " +
          (value === null ? "text-faint" : scoreColor(value))
        }
      >
        {value === null ? "—" : `${value}%`}
      </div>
      <div className="mt-1 text-sm text-muted">{sub}</div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "text-good";
  if (score >= 45) return "text-warn";
  return "text-bad";
}

function DayColumn({
  date,
  dayOfWeek,
  blocks,
  errors,
  isToday,
  adherenceBySlot,
  onAdd,
  onEdit,
  onRevert,
}: {
  date: string;
  dayOfWeek: DayOfWeek;
  blocks: ResolvedScheduleBlock[];
  errors: ScheduleValidationError[];
  isToday: boolean;
  adherenceBySlot: Map<string, BlockAdherence>;
  onAdd: () => void;
  onEdit: (b: ResolvedScheduleBlock) => void;
  onRevert: () => void;
}) {
  const dayNum = Number(date.slice(8, 10));
  const hasOverride = blocks.some((b) => b.isOverridden);

  return (
    <section
      className={
        "rounded-xl border p-3 space-y-2 " +
        (isToday
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface/40")
      }
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-text">
          {DAY_SHORT_NAMES[dayOfWeek]}{" "}
          <span className="text-subtle tabular-nums">{dayNum}</span>
        </h2>
        {hasOverride && (
          <button
            onClick={onRevert}
            title="Discard this week's changes and go back to the repeating plan"
            className="text-xs text-warn/80 hover:text-warn underline decoration-dotted"
          >
            revert
          </button>
        )}
      </div>

      {blocks.length === 0 && (
        <p className="text-xs text-faint py-2">Nothing planned.</p>
      )}

      {blocks.map((b) => (
        <BlockCard
          key={`${b.blockId ?? "o"}-${b.overrideId ?? ""}-${b.startMin}`}
          block={b}
          adherence={adherenceBySlot.get(slotKey(date, b.startMin, b.endMin)) ?? null}
          onClick={() => onEdit(b)}
        />
      ))}

      {errors.map((e, i) => (
        <p key={i} className="text-xs text-warn/90 leading-snug">
          {e.message}
        </p>
      ))}

      <button
        onClick={onAdd}
        className="w-full text-xs px-2 py-1.5 rounded-md border border-dashed border-border-strong text-subtle hover:text-text hover:border-border-strong"
      >
        + Add block
      </button>
    </section>
  );
}

function BlockCard({
  block,
  adherence,
  onClick,
}: {
  block: ResolvedScheduleBlock;
  adherence: BlockAdherence | null;
  onClick: () => void;
}) {
  const pct =
    adherence && adherence.adherence !== null
      ? Math.round(adherence.adherence * 100)
      : null;
  const active = adherence?.status === "active";

  return (
    <button
      onClick={onClick}
      className={
        "w-full text-left rounded-lg border px-2.5 py-2 transition-colors " +
        (active
          ? "border-accent/50 bg-accent/10 hover:bg-accent/15"
          : "border-border bg-bg/40 hover:bg-elevate/50")
      }
    >
      <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted">
        {block.isPrimary && (
          <span className="text-warn" title="Most important task">
            ★
          </span>
        )}
        <span>
          {formatMinuteOfDay(block.startMin)}–{formatMinuteOfDay(block.endMin)}
        </span>
        {block.isOverridden && (
          <span
            className="text-warn/70"
            title="Changed for this date only"
          >
            •
          </span>
        )}
      </div>
      <div className="text-sm text-text leading-snug mt-0.5">{block.title}</div>
      <div className="text-xs text-subtle mt-0.5">{block.category}</div>

      {pct !== null && (
        <div className="mt-1.5">
          <div className="h-1.5 w-full rounded-full bg-elevate overflow-hidden">
            <div
              className={
                "h-full rounded-full transition-[width] duration-500 " +
                (pct >= 75 ? "bg-good" : pct >= 45 ? "bg-warn" : "bg-bad")
              }
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="text-xs text-subtle mt-0.5 tabular-nums">
            {pct}% on plan
            {adherence && adherence.status === "active" && " · in progress"}
          </div>
        </div>
      )}
    </button>
  );
}

function weekRangeLabel(startDate: string, endDate: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(
    undefined,
    { ...opts, year: "numeric" }
  )}`;
}
