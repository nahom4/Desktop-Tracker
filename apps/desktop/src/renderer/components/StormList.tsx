import type { StormInterval } from "@desktop-tracker/shared";
import { formatDuration, formatTime } from "../lib/format";

interface StormListProps {
  storms: StormInterval[];
}

export function StormList({ storms }: StormListProps) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-text">
          Category-switch storms
        </h3>
        <div className="text-xs text-subtle">{storms.length} detected</div>
      </div>
      {storms.length === 0 ? (
        <p className="text-sm text-subtle">
          No storms — your focus stayed intact.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {storms.map((s, i) => (
            <li
              key={`${s.startTs}-${i}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-full bg-bad" />
                <span className="text-text tabular-nums">
                  {formatTime(s.startTs)} → {formatTime(s.endTs)}
                </span>
                <span className="text-subtle">
                  {formatDuration(Math.max(s.endTs - s.startTs, 60_000))}
                </span>
              </div>
              <div className="text-muted tabular-nums">
                {s.totalSwitches} category switches · peak {s.peakSwitchesPerMin}/min
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
