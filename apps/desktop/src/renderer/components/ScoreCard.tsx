interface ScoreCardProps {
  label: string;
  value: number;
  sub?: string;
  delta?: number;
}

export function ScoreCard({ label, value, sub, delta }: ScoreCardProps) {
  const tone =
    value >= 80 ? "text-good" : value >= 60 ? "text-accent" : value >= 40 ? "text-warn" : "text-bad";
  const deltaTone =
    delta === undefined || delta === 0
      ? "text-subtle"
      : delta > 0
      ? "text-good"
      : "text-bad";

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="text-xs uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <div className={`text-4xl font-semibold tabular-nums ${tone}`}>{value}</div>
        <div className="text-faint text-sm">/100</div>
        {delta !== undefined && (
          <div className={`text-sm ${deltaTone}`}>
            {delta > 0 ? "+" : ""}
            {delta} vs last week
          </div>
        )}
      </div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
    </div>
  );
}
