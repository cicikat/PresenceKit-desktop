import type { ReactNode } from 'react';

interface DreamGlowBubbleProps {
  side: 'left' | 'right';
  speaker?: ReactNode;
  emotionTag?: ReactNode;
  timestamp?: ReactNode;
  children: ReactNode;
  topSheen?: boolean;
  className?: string;
}

export function DreamGlowBubble({
  side,
  speaker,
  emotionTag,
  timestamp,
  children,
  topSheen = true,
  className = '',
}: DreamGlowBubbleProps) {
  const hasMeta = speaker || emotionTag || timestamp;

  return (
    <div className={`dream-glow-bubble dream-glow-bubble--${side}${className ? ` ${className}` : ''}`}>
      {hasMeta && (
        <div className="dream-glow-bubble__meta">
          {speaker && <span>{speaker}</span>}
          {speaker && timestamp && <span aria-hidden="true">·</span>}
          {timestamp && <span>{timestamp}</span>}
          {emotionTag && <span className="dream-glow-bubble__emotion">{emotionTag}</span>}
        </div>
      )}
      <div className={`dream-glow-bubble__body${topSheen ? ' is-sheen' : ''}`}>
        {children}
      </div>
    </div>
  );
}
