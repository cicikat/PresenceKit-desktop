export interface HudMeterProps {
  label?: string;
  value: number | null;
  max?: number;
  displayValue?: string;
  background: string;
  ticks?: number[];
  delta?: number | null;
}

function fillPercent(value: number | null, max: number): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function deltaArrow(delta: number | null | undefined): '↑' | '↓' | '→' | null {
  if (delta == null) return null;
  if (delta > 0.05) return '↑';
  if (delta < -0.05) return '↓';
  return '→';
}

export function HudMeter({
  label,
  value,
  max = 100,
  displayValue,
  background,
  ticks = [25, 50, 75],
  delta,
}: HudMeterProps) {
  const pct = fillPercent(value, max);
  const arrow = deltaArrow(delta);
  const showLabel = label != null && label !== '';
  const rightText =
    displayValue ?? (value === null || !Number.isFinite(value) ? '—' : `${Math.round(pct)}%`);

  return (
    <div className="dream-hud__metric">
      {showLabel && (
        <div className="dream-hud__metric-head">
          <span>{label}</span>
          <span>
            {arrow && <span style={{ marginRight: 3 }}>{arrow}</span>}
            {rightText}
          </span>
        </div>
      )}
      <div className="dream-hud__meter">
        <div className="dream-hud__meter-fill" style={{ width: `${pct}%`, background }} />
        {ticks.map(tick => (
          <span key={tick} className="dream-hud__meter-tick" style={{ left: `${tick}%` }} />
        ))}
      </div>
    </div>
  );
}
