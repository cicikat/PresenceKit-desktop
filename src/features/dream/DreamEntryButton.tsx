import { useState } from 'react';

interface DreamEntryButtonProps {
  active: boolean;
  onToggle: () => void;
}

export function DreamEntryButton({ active, onToggle }: DreamEntryButtonProps) {
  const [hover, setHover] = useState(false);
  const label = active ? 'WAKE · 关闭梦境' : '进入梦境';

  return (
    <div
      className="dream-entry"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={`dream-entry__button${active ? ' is-active' : ''}`}
        aria-label={label}
        title={label}
        onClick={onToggle}
      >
        <span className="dream-entry__moon" />
      </button>
      {hover && <div className="dream-entry__tooltip">{label}</div>}
    </div>
  );
}
