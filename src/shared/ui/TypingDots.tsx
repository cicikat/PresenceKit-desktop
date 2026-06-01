import type { CSSProperties } from 'react';
import './TypingDots.css';

export function TypingDots({ color }: { color: string }) {
  return (
    <span
      className="shared-typing-dots"
      style={{ '--typing-dots-color': color } as CSSProperties}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
