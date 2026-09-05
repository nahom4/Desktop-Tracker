import { useEffect, useState } from "react";
import { formatMinuteOfDay } from "@desktop-tracker/analysis";
import type {
  SchedulePlanCategoryStat,
  ScheduleNowStatus,
} from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { formatDuration } from "../lib/format";
import { CategoryPlanPanel } from "./CategoryPlanPanel";

/**
 * "What am I supposed to be doing right now?" — the plan's answer, plus how
 * closely the current block is being kept.
 */
export function ScheduleNowCard({ onOpenSchedule }: { onOpenSchedule?: () => void }) {
  const [status, setStatus] = useState<ScheduleNowStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await api.scheduleNow();
        if (!cancelled) {
          setStatus(s);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (failed || !status) return null;

  const { current, next, currentAdherence, today } = status;
  const nothingPlanned = today.blocks.length === 0;

  // Blocks are keyed by start time rather than blockId: one-off `add`
  // overrides carry a null blockId, so ids alone cannot identify them.
  const currentAdh = current
    ? today.blocks.find((b) => b.block.startTs === current.startTs)
    : undefined;
  const primaryAdh = today.blocks.find((b) => b.block.isPrimary);

  // During free time there is no current block, but that is exactly when you
  // want to write up what just finished — so fall back to the last block that
  // ended, then to the next one, rather than hiding the panel entirely.
  const lastFinished = [...today.blocks]
    .filter((b) => b.block.endTs <= status.now)
    .sort((a, b) => a.block.endTs - b.block.endTs)
    .pop();
  const panelCategory =
    current?.category ?? lastFinished?.block.category ?? next?.category ?? null;
  const panelLabel = current
    ? null
    : lastFinished
      ? `just finished — ${lastFinished.block.title}`
      : next
        ? `coming up — ${next.title}`
        : null;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-text">On the plan</h3>
        {onOpenSchedule && (
          <button
            onClick={onOpenSchedule}
            className="text-xs text-subtle hover:text-text underline decoration-dotted"
          >
            edit schedule
          </button>
        )}
      </div>

      {nothingPlanned ? (
        <p className="text-sm text-subtle">
          Nothing scheduled today. Add blocks on the Schedule page to start
          grading your days against a plan.
        </p>
      ) : (
        <div className="space-y-3">
          {current ? (
            <div>
              <div className="flex items-center gap-2 text-xs text-subtle tabular-nums">
                {current.isPrimary && <span className="text-warn">★</span>}
                <span>
                  {formatMinuteOfDay(current.startMin)}–
                  {formatMinuteOfDay(current.endMin)}
                </span>
                <span className="text-faint">now</span>
              </div>
              <div className="text-lg text-text mt-0.5">{current.title}</div>
              <div className="text-xs text-subtle">{current.category}</div>
              {currentAdherence !== null && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-elevate overflow-hidden">
                    <div
                      className={
                        "h-full rounded-full transition-[width] duration-500 " +
                        barColor(currentAdherence)
                      }
                      style={{ width: `${Math.min(100, currentAdherence)}%` }}
                    />
                  </div>
                  <div className="text-xs text-subtle mt-1 tabular-nums">
                    {currentAdh && (
                      <>
                        <span className="text-text">
                          {formatDuration(currentAdh.onPlanMs)}
                        </span>
                        <span className="text-faint"> / </span>
                        <span>
                          {formatDuration(current.endTs - current.startTs)}
                        </span>
                        <span className="text-faint"> · </span>
                      </>
                    )}
                    {currentAdherence}% of this block spent on {current.category}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing scheduled right now — free time.
            </p>
          )}

          {next && (
            <div className="text-sm text-muted border-t border-border pt-2.5">
              <span className="text-subtle text-xs uppercase tracking-wider mr-2">
                Next
              </span>
              <span className="tabular-nums text-text">
                {formatMinuteOfDay(next.startMin)}
              </span>{" "}
              {next.isPrimary && <span className="text-warn">★ </span>}
              {next.title}
            </div>
          )}

          {/* The checklist and notes for the category in play — this is where
              "what did I do here last time" shows up, and where today's note
              gets written. */}
          {panelCategory && (
            <div className="border-t border-border pt-3">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-medium text-text">
                  {panelCategory}
                </span>
                {panelLabel && (
                  <span className="text-xs text-subtle">{panelLabel}</span>
                )}
              </div>
              <CategoryPlanPanel category={panelCategory} compact />
            </div>
          )}

          {status.byCategory.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-subtle">
                  Time by category
                </span>
                <span className="text-xs text-faint">spent / planned today</span>
              </div>
              <div className="space-y-2.5">
                {status.byCategory.map((c) => (
                  <CategoryTimeBar key={c.category} stat={c} />
                ))}
              </div>
            </div>
          )}

          {status.offPlanProductive.totalMs > 0 && (
            <div className="border-t border-border pt-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wider text-subtle">
                  Productive off plan
                </span>
                <span className="text-sm tabular-nums text-good">
                  {formatDuration(status.offPlanProductive.totalMs)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle tabular-nums">
                {status.offPlanProductive.byCategory.map((c) => (
                  <span key={c.category} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.category} {formatDuration(c.ms)}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-faint">
                Worthwhile work today's plan didn't ask for — counted here, not in
                adherence.
              </p>
            </div>
          )}

          <div className="flex gap-6 border-t border-border pt-2.5 text-sm">
            <Stat
              label="Today's adherence"
              value={today.score}
              spentMs={today.onPlanMs}
              totalMs={today.plannedMs}
            />
            <Stat
              label="★ Most important"
              value={today.primaryScore}
              spentMs={primaryAdh?.onPlanMs}
              totalMs={
                primaryAdh &&
                primaryAdh.block.endTs - primaryAdh.block.startTs
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One category scheduled today: how much time it actually took against how
 * much the plan set aside for it.
 */
function CategoryTimeBar({ stat }: { stat: SchedulePlanCategoryStat }) {
  const { plannedMs, actualMs, onPlanMs, elapsedPlannedMs } = stat;
  const pct = Math.round((actualMs / plannedMs) * 100);
  const over = actualMs > plannedMs;
  const remaining = Math.max(0, plannedMs - actualMs);

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: stat.color }}
          />
          <span className="text-text truncate">{stat.category}</span>
        </div>
        <div className="tabular-nums text-muted text-right shrink-0">
          <span className="text-text">{formatDuration(actualMs)}</span>
          <span className="text-faint"> / </span>
          <span>{formatDuration(plannedMs)}</span>
          <span className={"ml-2 text-xs " + (over ? "text-warn" : "text-subtle")}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-elevate/70 overflow-hidden mt-1">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, (actualMs / plannedMs) * 100)}%`,
            backgroundColor: stat.color,
          }}
        />
      </div>
      <div className="text-xs text-subtle mt-1 tabular-nums">
        {over
          ? `${formatDuration(actualMs - plannedMs)} over plan`
          : `${formatDuration(remaining)} to go`}
        {/* Before the first block starts there is no elapsed time to report
            on, and "0s of 0s" is worse than saying nothing. */}
        {elapsedPlannedMs > 0 ? (
          <>
            <span className="text-faint"> · </span>
            {formatDuration(onPlanMs)} of {formatDuration(elapsedPlannedMs)} elapsed
            block time on plan
          </>
        ) : (
          <>
            <span className="text-faint"> · </span>
            not started yet
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  spentMs,
  totalMs,
}: {
  label: string;
  value: number | null;
  /** On-plan time so far; shown as "spent / allotted" under the percentage. */
  spentMs?: number;
  totalMs?: number;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-subtle">{label}</div>
      <div
        className={
          "text-xl font-semibold tabular-nums " +
          (value === null ? "text-faint" : textColor(value))
        }
      >
        {value === null ? "—" : `${value}%`}
      </div>
      {spentMs != null && totalMs != null && totalMs > 0 && (
        <div className="text-xs tabular-nums text-subtle">
          <span className="text-text">{formatDuration(spentMs)}</span>
          <span className="text-faint"> / </span>
          <span>{formatDuration(totalMs)}</span>
        </div>
      )}
    </div>
  );
}

function barColor(score: number): string {
  if (score >= 75) return "bg-good";
  if (score >= 45) return "bg-warn";
  return "bg-bad";
}

function textColor(score: number): string {
  if (score >= 75) return "text-good";
  if (score >= 45) return "text-warn";
  return "text-bad";
}
