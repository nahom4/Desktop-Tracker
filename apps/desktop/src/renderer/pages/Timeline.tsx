import { useEffect, useMemo, useState } from "react";
import type { ActivityEvent } from "@desktop-tracker/shared";
import { api } from "../lib/api";
import { TimelineStrip } from "../components/TimelineStrip";
import { formatDuration, formatTime } from "../lib/format";

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

export function Timeline() {
  const [offset, setOffset] = useState(0); // days back from today
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return startOfDay(d);
  }, [offset]);
  const dayEnd = dayStart + DAY_MS;

  useEffect(() => {
    let cancelled = false;
    api.eventsInRange(dayStart, dayEnd).then((ev) => {
      if (!cancelled) setEvents(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [dayStart, dayEnd]);

  const dateLabel = new Date(dayStart).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
          <p className="text-sm text-subtle mt-1">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setOffset((o) => o + 1)}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-elevate transition-colors"
          >
            ← Previous day
          </button>
          <button
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            className="px-3 py-1.5 rounded-md border border-border hover:bg-elevate transition-colors disabled:opacity-40"
          >
            Next day →
          </button>
        </div>
      </header>

      <TimelineStrip events={events} periodStart={dayStart} periodEnd={dayEnd} />

      <div className="rounded-xl border border-border bg-surface/40">
        <div className="px-5 py-3 border-b border-border text-sm font-medium text-text">
          Sessions
        </div>
        <div className="divide-y divide-slate-800/60">
          {events.length === 0 && (
            <div className="px-5 py-6 text-sm text-subtle">No sessions recorded.</div>
          )}
          {events.map((e) => (
            <div key={e.id} className="px-5 py-3 grid grid-cols-12 gap-3 text-sm items-center">
              <div className="col-span-2 text-muted tabular-nums">
                {formatTime(e.startTs)} → {formatTime(e.endTs)}
              </div>
              <div className="col-span-1 text-subtle tabular-nums">
                {formatDuration(e.durationMs)}
              </div>
              <div className="col-span-2 text-text truncate">{e.exe}</div>
              <div className="col-span-2 text-muted truncate">{e.project ?? ""}</div>
              <div className="col-span-2 text-muted truncate">{e.domain ?? ""}</div>
              <div className="col-span-3 text-subtle truncate">{e.title ?? ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
