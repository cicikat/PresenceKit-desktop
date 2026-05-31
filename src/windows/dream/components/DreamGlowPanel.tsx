import type { ReactNode } from 'react';

export type DreamGlowTone = 'accent' | 'cool' | 'muted';

export interface DreamGlowTag {
  content: ReactNode;
  tone?: DreamGlowTone;
}

interface DreamGlowPanelProps {
  title?: ReactNode;
  status?: ReactNode;
  tags?: DreamGlowTag[];
  children?: ReactNode;
  topSheen?: boolean;
  className?: string;
}

export function DreamGlowPanel({
  title,
  status,
  tags = [],
  children,
  topSheen = true,
  className = '',
}: DreamGlowPanelProps) {
  return (
    <section className={`dream-glow-panel${topSheen ? ' is-sheen' : ''}${className ? ` ${className}` : ''}`}>
      {title && <div className="dream-glow-panel__title">{title}</div>}
      {status && <div className="dream-glow-panel__status">{status}</div>}
      {children && <div className="dream-glow-panel__content">{children}</div>}
      {tags.length > 0 && (
        <div className="dream-glow-panel__tags">
          {tags.map((tag, index) => (
            <span
              key={index}
              className={`dream-glow-panel__tag dream-glow-panel__tag--${tag.tone ?? 'muted'}`}
            >
              {tag.content}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
