// Client-side incremental narrative parser — mirrors the segment grammar of
// Emerald-presence's `core/narrative_parser.py` so streaming replies render
// segmented (say/do/env/feel bubbles) as they arrive, not only after the
// terminal HTTP response patches `segments` in (cc-tasks/33 §A).
//
// Usage: `parseIncremental(fullText)` is a *pure* function of the accumulated
// text so far — call it again with the full buffer after every delta. Both
// formats auto-close a trailing open tag/line at the end of the buffer, which
// is exactly what gives an in-flight (still-streaming) segment its optimistic
// render: re-parsing the growing prefix naturally reclassifies it once the
// closing marker lands.
import type { NarrativeSegment, NarrativeSegmentType } from './types';

const KNOWN_TAGS = new Set(['say', 'do', 'env', 'feel']);
const INLINE_STYLE_TAGS = new Set(['hl', 'big', 'sm']);

const TAG_TOKEN_RE = /<(\/?)([\w]+)>/g;
const HAS_XML_RE = /<(?:say|do|env|feel)>/;

// Full-line markdown markers (closed).
const MD_DO_RE = /^\*([^*]+)\*$/;
const MD_FEEL_RE = /^_([^_]+)_$/;
const MD_ENV_RE = /^> (.+)$/;
// Optimistic still-open variants: opening marker present, no closing marker yet
// (only meaningful for the last line of the current buffer — earlier lines are
// already newline-terminated and follow the closed rules only).
const MD_DO_OPEN_RE = /^\*([^*]*)$/;
const MD_FEEL_OPEN_RE = /^_([^_]*)$/;

export function parseIncremental(fullText: string): NarrativeSegment[] {
  if (!fullText) return [];
  return HAS_XML_RE.test(fullText) ? parseXmlIncremental(fullText) : parseMarkdownIncremental(fullText);
}

function parseXmlIncremental(text: string): NarrativeSegment[] {
  type TokenKind = 'text' | 'open_known' | 'close_known';
  const tokens: [TokenKind, string][] = [];

  let pos = 0;
  TAG_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_TOKEN_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > pos) tokens.push(['text', text.slice(pos, start)]);
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (KNOWN_TAGS.has(tag)) {
      tokens.push([isClose ? 'close_known' : 'open_known', tag]);
    } else if (INLINE_STYLE_TAGS.has(tag)) {
      tokens.push(['text', m[0]]);
    }
    pos = end;
  }
  if (pos < text.length) tokens.push(['text', text.slice(pos)]);

  const segments: NarrativeSegment[] = [];
  let currentTag: string | null = null;
  let buf: string[] = [];

  const flush = (segType: string) => {
    const t = buf.join('').trim();
    buf = [];
    if (t) segments.push({ type: segType as NarrativeSegmentType, text: t });
  };

  for (const [kind, value] of tokens) {
    if (kind === 'text') {
      buf.push(value);
    } else if (kind === 'open_known') {
      if (currentTag === null) {
        flush('narration');
        currentTag = value;
      } else {
        buf.push(`<${value}>`);
      }
    } else if (kind === 'close_known') {
      if (currentTag === value) {
        flush(currentTag);
        currentTag = null;
      } else {
        buf.push(`</${value}>`);
      }
    }
  }
  flush(currentTag ?? 'narration');

  return segments;
}

function parseMarkdownIncremental(text: string): NarrativeSegment[] {
  const segments: NarrativeSegment[] = [];
  let sayLines: string[] = [];

  const flushSay = () => {
    const content = sayLines.join('\n').trim();
    sayLines = [];
    if (content) segments.push({ type: 'say', text: content });
  };

  const lines = text.split('\n');
  const lastIndex = lines.length - 1;

  lines.forEach((line, idx) => {
    const stripped = line.trim();
    const isLast = idx === lastIndex;

    if (!stripped) {
      flushSay();
      return;
    }

    const mDo = MD_DO_RE.exec(stripped);
    const mFeel = MD_FEEL_RE.exec(stripped);
    const mEnv = MD_ENV_RE.exec(stripped);

    if (mDo) {
      flushSay();
      const t = mDo[1].trim();
      if (t) segments.push({ type: 'do', text: t });
      return;
    }
    if (mFeel) {
      flushSay();
      const t = mFeel[1].trim();
      if (t) segments.push({ type: 'feel', text: t });
      return;
    }
    if (mEnv) {
      flushSay();
      const t = mEnv[1].trim();
      if (t) segments.push({ type: 'env', text: t });
      return;
    }

    if (isLast) {
      const mDoOpen = MD_DO_OPEN_RE.exec(stripped);
      if (mDoOpen && mDoOpen[1].trim()) {
        flushSay();
        segments.push({ type: 'do', text: mDoOpen[1].trim() });
        return;
      }
      const mFeelOpen = MD_FEEL_OPEN_RE.exec(stripped);
      if (mFeelOpen && mFeelOpen[1].trim()) {
        flushSay();
        segments.push({ type: 'feel', text: mFeelOpen[1].trim() });
        return;
      }
    }

    sayLines.push(line);
  });

  flushSay();
  return segments;
}
