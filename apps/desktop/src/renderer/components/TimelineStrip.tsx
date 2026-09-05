import type { ActivityEvent } from "@desktop-tracker/shared";
import { CATEGORY_COLORS } from "@desktop-tracker/shared";
import { useMemo, useState } from "react";
import { formatDuration, formatTime } from "../lib/format";

interface TimelineStripProps {
  events: ActivityEvent[];
  /** Map of (exe|domain) → category to colour bars consistently with the rest of the UI. */
  categoryByEventId?: Map<number, string>;
  /** Local-time start (00:00) of the period to render. */
  periodStart: number;
  /** Local-time end (24:00) of the period to render. */
  periodEnd: number;
}

export function TimelineStrip({
  events,
  categoryByEventId,
  periodStart,
  periodEnd,
}: TimelineStripProps) {
  const [hover, setHover] = useState<ActivityEvent | null>(null);
  const total = periodEnd - periodStart;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = 0; h <= 24; h += 3) out.push(h);
    return out;
  }, []);

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-medium text-text">Timeline</h3>
        <div className="text-xs text-subtle">
          {events.length} sessions
        </div>
      </div>

      <div className="relative h-14 rounded-md bg-bg/60 border border-border overflow-hidden">
        {events.map((e) => {
          const start = Math.max(e.startTs, periodStart);
          const end = Math.min(e.endTs, periodEnd);
          if (end <= start) return null;
          const left = ((start - periodStart) / total) * 100;
          const width = Math.max(((end - start) / total) * 100, 0.05);
          const cat = categoryByEventId?.get(e.id);
          const color = e.isIdle || e.isLocked
            ? "#1f2937"
            : (cat && CATEGORY_COLORS[cat]) || "#475569";
          return (
            <div
              key={e.id}
              className="absolute top-0 bottom-0 cursor-pointer transition-opacity hover:opacity-80"
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-xs text-subtle tabular-nums">
        {hours.map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}:00</span>
        ))}
      </div>

      <div className="mt-3 h-10 text-xs">
        {hover ? (
          <div className="flex items-center gap-4">
            <span className="text-text font-medium">{hover.exe}</span>
            {hover.project && <span className="text-muted">proj: {hover.project}</span>}
            {hover.domain && <span className="text-muted">{hover.domain}</span>}
            {hover.title && (
              <span className="text-subtle truncate max-w-[40ch]">{hover.title}</span>
            )}
            <span className="ml-auto text-muted tabular-nums">
              {formatTime(hover.startTs)} → {formatTime(hover.endTs)} ·{" "}
              {formatDuration(hover.durationMs)}
            </span>
          </div>
        ) : (
          <div className="text-faint">Hover a bar for details.</div>
        )}
      </div>
    </div>
  );
}
