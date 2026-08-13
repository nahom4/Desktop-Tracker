import type { CategoryHealth } from "@desktop-tracker/shared";
import { formatDuration } from "../lib/format";

interface HealthBarsProps {
  title?: string;
  health: CategoryHealth[];
  /** Period label used for the "vs target" copy. */
  period: "day" | "week";
}

export function HealthBars({ title = "Category health", health, period }: HealthBarsProps) {
  const tracked = health.filter((h) => h.isHealthTracked);
  if (tracked.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="text-sm font-medium text-text mb-2">{title}</h3>
        <p className="text-sm text-subtle">
          No categories are health-tracked yet — toggle a category in the Categories page.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <span className="text-xs text-subtle">
          target per {period}
        </span>
      </div>
      <div className="space-y-3">
        {tracked.map((h) => {
          const progress = h.progress ?? 0;
          const pct = Math.round(progress * 100);
          const targetLabel = h.targetMs
            ? formatDuration(h.targetMs)
            : "no target";
          const remaining = h.targetMs ? Math.max(0, h.targetMs - h.actualMs) : 0;
          return (
            <div key={h.category}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: h.color }}
                  />
                  <span className="text-text">{h.category}</span>
                </div>
                <div className="tabular-nums text-muted">
                  <span className="text-text">{formatDuration(h.actualMs)}</span>
                  <span className="text-faint"> / </span>
                  <span>{targetLabel}</span>
                  {h.targetMs && (
                    <span className="ml-2 text-xs text-subtle">
                      {progress >= 1
                        ? `+${formatDuration(h.actualMs - h.targetMs)} over`
                        : `${formatDuration(remaining)} to go`}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-elevate/70 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: h.color,
                    opacity: progress >= 1 ? 1 : 0.7,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
