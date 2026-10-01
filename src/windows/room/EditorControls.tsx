// Shared primitives for room-related parameter UIs. Originally lived inline in
// CallSettingsPage.tsx; pulled out here (work order 2) so the in-call editor panel
// (EditorPanel.tsx) can reuse the exact same row/slider look instead of forking a copy.
import type { CSSProperties } from 'react';

export function Row({ label, hint, children, stacked }: {
  label: string; hint?: string; children: React.ReactNode;
  /** Label above the control instead of beside it — for narrow containers like the editor panel. */
  stacked?: boolean;
}) {
  return (
    <div style={stacked
      ? { display: 'grid', gap: 4 }
      : { display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={stacked ? undefined : { flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export function SliderNum({
  min, max, step, value, onChange, unit, width = 240, disabled,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; unit?: string; width?: number | string; disabled?: boolean;
}) {
  const numStyle: CSSProperties = {
    width: 58, padding: '4px 6px', fontSize: 11,
    border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
    background: 'var(--paper-2)', color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono, monospace)', textAlign: 'right',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width }}>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        style={numStyle}
      />
      {unit && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', width: 18 }}>{unit}</span>}
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: 'var(--paper-edge)' }} />;
}

export function SectionHeader({ label, hint, open, onToggle }: {
  label: string; hint?: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        all: 'unset', display: 'flex', width: '100%', alignItems: 'center',
        gap: 8, cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>{hint}</div>}
      </div>
      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{open ? '▲' : '▼'}</span>
    </button>
  );
}
