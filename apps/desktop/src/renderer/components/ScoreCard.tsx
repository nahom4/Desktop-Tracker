interface ScoreCardProps {
  label: string;
  value: number;
  sub?: string;
  delta?: number;
}

export function ScoreCard({ label, value, sub, delta }: ScoreCardProps) {
  const tone =
    value >= 80 ? "text-emerald-400" : value >= 60 ? "text-sky-400" : value >= 40 ? "text-amber-400" : "text-rose-400";
  const deltaTone =
    delta === undefined || delta === 0
      ? "text-slate-500"
      : delta > 0
      ? "text-emerald-400"
      : "text-rose-400";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className={`text-4xl font-semibold tabular-nums ${tone}`}>{value}</div>
        <div className="text-slate-600 text-sm">/100</div>
        {delta !== undefined && (
          <div className={`text-sm ${deltaTone}`}>
            {delta > 0 ? "+" : ""}
            {delta} vs last week
          </div>
        )}
      </div>
      {sub && <div className="mt-1 text-sm text-slate-400">{sub}</div>}
    </div>
  );
}
