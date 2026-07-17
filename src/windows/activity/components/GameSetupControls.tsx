import type { CSSProperties } from 'react';

// Shared "对局设置" row for ChessPage / GomokuPage (cc-tasks/33 §B): opponent
// select → style select (AI-only) → start button, inline in one row. All copy
// is caller-supplied (option labels, button label) so this component never
// hardcodes Chinese — callers resolve text via i18n or page-local composition
// (e.g. active-character-name interpolation, which the static i18n table
// doesn't support).
export interface GameSetupOption {
  value: string;
  label: string;
}

interface GameSetupControlsProps {
  opponentOptions: GameSetupOption[];
  opponentValue: string;
  onOpponentChange: (value: string) => void;
  styleOptions: GameSetupOption[];
  styleValue: string;
  onStyleChange: (value: string) => void;
  showStyleSelect: boolean;
  onStart: () => void;
  startLabel: string;
  loading: boolean;
}

const selectStyle: CSSProperties = {
  fontFamily: 'inherit', fontSize: 12, padding: '6px 10px',
  borderRadius: 'var(--radius-sm)', border: '1px solid var(--paper-edge)',
  background: 'var(--paper-2)', color: 'var(--ink)', cursor: 'pointer',
};

const startButtonStyle: CSSProperties = {
  fontFamily: 'inherit', fontSize: 12.5,
  padding: '7px 14px', borderRadius: 'var(--radius-sm)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  letterSpacing: 0.3, transition: 'background 0.15s',
  border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)',
  fontWeight: 600,
};

export function GameSetupControls({
  opponentOptions,
  opponentValue,
  onOpponentChange,
  styleOptions,
  styleValue,
  onStyleChange,
  showStyleSelect,
  onStart,
  startLabel,
  loading,
}: GameSetupControlsProps) {
  return (
    <>
      <select
        value={opponentValue}
        onChange={e => onOpponentChange(e.target.value)}
        disabled={loading}
        style={{ ...selectStyle, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
      >
        {opponentOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {showStyleSelect && (
        <select
          value={styleValue}
          onChange={e => onStyleChange(e.target.value)}
          disabled={loading}
          style={{ ...selectStyle, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {styleOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
      <button
        onClick={onStart}
        disabled={loading}
        style={{ ...startButtonStyle, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.45 : 1 }}
      >
        {startLabel}
      </button>
    </>
  );
}
