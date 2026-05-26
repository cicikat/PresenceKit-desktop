import type { CSSProperties } from 'react';

export type DreamMessageRole = 'her' | 'user' | 'system';

interface DreamMessageProps {
  role: DreamMessageRole;
  text: string;
  delayMs?: number;
}

export function DreamMessage({ role, text, delayMs = 0 }: DreamMessageProps) {
  const style = { '--dream-message-delay': `${delayMs}ms` } as CSSProperties;

  return (
    <div className={`dream-message dream-message--${role}`} style={style}>
      {text}
    </div>
  );
}
