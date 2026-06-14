import type { CSSProperties, ReactNode } from 'react';

// Matches <hl>...</hl>, <big>...</big>, <sm>...</sm>.
// [^<]{0,200} — no nested angle brackets, capped at 200 chars to prevent runaway.
// The backreference \1 ensures opening and closing tags match.
const INLINE_TAG_RE = /<(hl|big|sm)>([^<]{0,200})<\/\1>/g;

const TAG_STYLES: Record<string, CSSProperties> = {
  hl: { color: 'var(--accent, oklch(0.55 0.18 25))', fontWeight: 600 },
  big: { fontSize: '1.18em' },
  sm: { fontSize: '0.85em', opacity: 0.8 },
};

/**
 * Parse inline style tags from text and return a ReactNode.
 * Only <hl>, <big>, <sm> are treated as markup; all other angle-bracket
 * sequences appear as literal text (no dangerouslySetInnerHTML).
 *
 * Intended usage: renderInlineStyled(normalizeChatDisplayText(text))
 */
export function renderInlineStyled(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  INLINE_TAG_RE.lastIndex = 0;
  while ((m = INLINE_TAG_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    const tagName = m[1];
    const content = m[2];
    parts.push(
      <span key={key++} style={TAG_STYLES[tagName]}>{content}</span>,
    );
    lastIndex = INLINE_TAG_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) return text;
  // All-string shortcut: no tags were found, return the original string unchanged.
  if (parts.every(p => typeof p === 'string')) return text;
  return <>{parts}</>;
}
