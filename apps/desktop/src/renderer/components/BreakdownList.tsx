import type { BreakdownBucket } from "@desktop-tracker/shared";
import { CATEGORY_COLORS } from "@desktop-tracker/shared";
import { formatDuration } from "../lib/format";

interface BreakdownListProps {
  title: string;
  buckets: BreakdownBucket[];
  max?: number;
  emptyMessage?: string;
}

export function BreakdownList({ title, buckets, max = 8, emptyMessage }: BreakdownListProps) {
  const top = buckets.slice(0, max);
  const total = buckets.reduce((s, b) => s + b.durationMs, 0);

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <div className="text-xs text-subtle">{formatDuration(total)} total</div>
      </div>
      {top.length === 0 && (
        <div className="text-sm text-subtle py-4">
          {emptyMessage ?? "No data yet."}
        </div>
      )}
      <ul className="space-y-2.5">
        {top.map((b) => {
          const pct = total > 0 ? (b.durationMs / total) * 100 : 0;
          const color = (b.category && CATEGORY_COLORS[b.category]) || "#475569";
          return (
            <li key={b.key} className="group">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-text">{b.label}</span>
                  {b.category && (
                    <span className="text-xs text-subtle shrink-0">{b.category}</span>
                  )}
                </div>
                <div className="text-muted tabular-nums shrink-0 ml-3">
                  {formatDuration(b.durationMs)}
                </div>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-elevate overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
