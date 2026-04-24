import type { StormInterval } from "@desktop-tracker/shared";
import { formatDuration, formatTime } from "../lib/format";

interface StormListProps {
  storms: StormInterval[];
}

export function StormList({ storms }: StormListProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-200">
          Category-switch storms
        </h3>
        <div className="text-xs text-slate-500">{storms.length} detected</div>
      </div>
      {storms.length === 0 ? (
        <p className="text-sm text-slate-500">
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
                <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                <span className="text-slate-200 tabular-nums">
                  {formatTime(s.startTs)} → {formatTime(s.endTs)}
                </span>
                <span className="text-slate-500">
                  {formatDuration(Math.max(s.endTs - s.startTs, 60_000))}
                </span>
              </div>
              <div className="text-slate-400 tabular-nums">
                {s.totalSwitches} category switches · peak {s.peakSwitchesPerMin}/min
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
