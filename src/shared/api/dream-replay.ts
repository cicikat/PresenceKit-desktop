import type {
  DreamArchiveDetailResponse,
  DreamArchiveListResponse,
  DreamArchiveMessage,
  DreamArchiveMetadata,
} from './dream-types';
import { normalizeDreamSegments } from '../../windows/dream/dreamMessage';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function normalizeMetadata(value: unknown): DreamArchiveMetadata | null {
  const raw = record(value);
  const dreamId = stringValue(raw.dream_id);
  if (!dreamId) return null;
  return {
    dream_id: dreamId,
    char_id: stringValue(raw.char_id, 'unknown'),
    started_at: numberValue(raw.started_at),
    ended_at: numberValue(raw.ended_at),
    valid_turns: nonNegativeInt(raw.valid_turns),
    valid_user_turns: nonNegativeInt(raw.valid_user_turns),
    valid_assistant_turns: nonNegativeInt(raw.valid_assistant_turns),
    dream_mode: stringValue(raw.dream_mode, 'unknown'),
    world_name: stringValue(raw.world_name, 'unknown'),
    exit_mechanism: stringValue(raw.exit_mechanism, 'unknown'),
    exit_initiator: stringValue(raw.exit_initiator, 'unknown'),
    completion: stringValue(raw.completion, 'unknown'),
    exit_reason: stringValue(raw.exit_reason, 'unknown'),
    summary_present: raw.summary_present === true,
    summary_created_at: numberValue(raw.summary_created_at),
    summary_title: stringValue(raw.summary_title),
    summary_preview: stringValue(raw.summary_preview),
    archive_parse_error: raw.archive_parse_error === true,
  };
}

export function normalizeDreamArchiveList(value: unknown): DreamArchiveListResponse {
  const raw = record(value);
  const items = Array.isArray(raw.items)
    ? raw.items.map(normalizeMetadata).filter((item): item is DreamArchiveMetadata => item !== null)
    : [];
  return {
    char_id: stringValue(raw.char_id, 'unknown'),
    items,
    offset: nonNegativeInt(raw.offset),
    limit: Math.max(1, nonNegativeInt(raw.limit) || 20),
    total: nonNegativeInt(raw.total),
    has_more: raw.has_more === true,
  };
}

function normalizeMessage(value: unknown): DreamArchiveMessage | null {
  const raw = record(value);
  if (raw.role !== 'user' && raw.role !== 'assistant') return null;
  const content = stringValue(raw.content);
  if (!content) return null;
  const message: DreamArchiveMessage = { role: raw.role, content, ts: numberValue(raw.ts) };
  if (typeof raw.lane === 'string') message.lane = raw.lane;
  if (typeof raw.kind === 'string') message.kind = raw.kind;
  if (typeof raw.correlation_id === 'string') message.correlation_id = raw.correlation_id;
  if (raw.role === 'assistant') {
    const hasSegments = raw.segments !== undefined;
    const segments = hasSegments ? normalizeDreamSegments(raw.segments) : null;
    if (segments !== null) {
      message.segments = segments;
      if (typeof raw.segmented_content === 'string') {
        message.segmented_content = raw.segmented_content;
      }
    } else if (hasSegments || raw.segment_parse_fallback === true) {
      message.segmented_content = content;
      message.segment_parse_fallback = true;
    }
    if (raw.segment_parse_fallback === true) {
      message.segmented_content = content;
      delete message.segments;
      message.segment_parse_fallback = true;
    }
  }
  return message;
}

export function normalizeDreamArchiveDetail(value: unknown): DreamArchiveDetailResponse | null {
  const raw = record(value);
  const metadata = normalizeMetadata(raw.metadata);
  const dreamId = stringValue(raw.dream_id) || metadata?.dream_id || '';
  if (!dreamId || !metadata) return null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(normalizeMessage).filter((item): item is DreamArchiveMessage => item !== null)
    : [];
  return {
    dream_id: dreamId,
    char_id: stringValue(raw.char_id, metadata.char_id),
    metadata,
    messages,
    partial_read: raw.partial_read === true,
  };
}
