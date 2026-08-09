import type { DreamMessage } from '../../shared/api/dream-types';
import type { NarrativeSegment, NarrativeSegmentType, PerformSpec } from '../../shared/api/types';

const NARRATIVE_SEGMENT_TYPES = new Set<NarrativeSegmentType>([
  'say', 'do', 'env', 'feel', 'narration',
]);

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function normalizePerform(value: unknown): PerformSpec | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const perform: PerformSpec = {};
  if (typeof raw.expression === 'string') perform.expression = raw.expression;
  if (typeof raw.intensity === 'number' && Number.isFinite(raw.intensity)) perform.intensity = raw.intensity;
  if (typeof raw.head === 'string' || raw.head === null) perform.head = raw.head as PerformSpec['head'];
  if (typeof raw.posture === 'string' || raw.posture === null) perform.posture = raw.posture as PerformSpec['posture'];
  if (typeof raw.gaze === 'string' || raw.gaze === null) perform.gaze = raw.gaze as PerformSpec['gaze'];
  if (typeof raw.energy === 'number' && Number.isFinite(raw.energy)) perform.energy = raw.energy;
  return Object.keys(perform).length > 0 ? perform : undefined;
}

/** Normalize escaped newlines without parsing or changing authored text. */
export function normalizeDreamText(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

/** Strictly accept the backend narrative contract; one bad item invalidates the projection. */
export function normalizeDreamSegments(value: unknown): NarrativeSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: NarrativeSegment[] = [];
  for (const item of value) {
    const raw = record(item);
    if (!raw || typeof raw.type !== 'string' || !NARRATIVE_SEGMENT_TYPES.has(raw.type as NarrativeSegmentType)) {
      return null;
    }
    if (typeof raw.text !== 'string' || raw.text.trim().length === 0) return null;
    const segment: NarrativeSegment = {
      type: raw.type as NarrativeSegmentType,
      text: raw.text,
    };
    const perform = normalizePerform(raw.perform);
    if (perform) segment.perform = perform;
    segments.push(segment);
  }
  return segments;
}

export interface CanonicalDreamMessageInput {
  id: string;
  role: DreamMessage['role'];
  text: string;
  segments?: unknown;
  segmentedContent?: unknown;
  speakerId?: string;
  roundId?: string;
  wsMsgId?: string;
}

/** Pure mapping for backend canonical Dream messages used by live, group, and replay paths. */
export function mapCanonicalDreamMessage(input: CanonicalDreamMessageInput): DreamMessage {
  const message: DreamMessage = {
    id: input.id,
    role: input.role,
    text: normalizeDreamText(input.text),
  };
  if (input.segments !== undefined) {
    const segments = normalizeDreamSegments(input.segments);
    if (segments !== null) message.segments = segments;
  }
  if (typeof input.segmentedContent === 'string') {
    message.segmentedContent = normalizeDreamText(input.segmentedContent);
  }
  if (input.speakerId) message.speakerId = input.speakerId;
  if (input.roundId) message.roundId = input.roundId;
  if (input.wsMsgId) message.wsMsgId = input.wsMsgId;
  return message;
}
