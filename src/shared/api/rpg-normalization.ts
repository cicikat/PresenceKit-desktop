import type { RpgTranscript, RpgTranscriptEntry } from './dream-types';

export function normalizeRpgTranscript(raw: unknown): RpgTranscript {
  if (!raw || typeof raw !== 'object') return { entries: [] };
  const value = raw as Record<string, unknown>;
  const source = Array.isArray(value.entries) ? value.entries : Array.isArray(value.items) ? value.items : [];
  const entries = source.filter(item => item && typeof item === 'object').map(item => item as RpgTranscriptEntry);
  return {
    entries,
    next_cursor: typeof value.next_cursor === 'string' ? value.next_cursor : typeof value.next_before === 'string' ? value.next_before : null,
    partial_read: value.partial_read === true,
  };
}
