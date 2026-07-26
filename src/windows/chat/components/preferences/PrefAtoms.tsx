import type { CSSProperties } from 'react';

export const prefSelectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 9px',
  border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)',
  color: 'var(--ink-2)',
  fontFamily: 'inherit',
  fontSize: 11,
};

export const prefActionButtonStyle: CSSProperties = {
  justifySelf: 'start',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: 12,
  background: 'var(--paper-2)',
  border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export function PrefRow({ label, hint, children }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>{hint}</div>
      </div>
      {children}
    </div>
  );
}

export function PrefRange({ min, max, step, value, onChange }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 250 }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <span className="mono" style={{ width: 34, color: 'var(--ink-3)', fontSize: 10, letterSpacing: 0.8 }}>
        {value}px
      </span>
    </div>
  );
}

export function PrefSwitch({ active, onClick }: any) {
  return (
    <button onClick={onClick} style={{
      width: 42, height: 22, borderRadius: 11,
      background: active ? 'var(--accent-3)' : 'var(--paper-3)',
      border: '1px solid var(--paper-edge)',
      cursor: 'pointer', position: 'relative', padding: 0, transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 1, left: active ? 21 : 1,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--paper)', boxShadow: '0 1px 3px var(--shadow-rgb-mix)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

export function MinuteSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <select
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      style={{ ...prefSelectStyle, width: 76 }}
    >
      {[0.25, 0.5, 1, 2, 3, 5, 10, 15, 30].map(minutes => (
        <option key={minutes} value={minutes}>{minutes < 1 ? `${minutes * 60}秒` : `${minutes}分`}</option>
      ))}
    </select>
  );
}
