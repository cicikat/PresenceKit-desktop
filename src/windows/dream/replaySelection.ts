import type { DreamArchiveMessage, DreamMessage } from '../../shared/api/dream-types';
import { mapCanonicalDreamMessage } from './dreamMessage';

export function isCurrentReplayRequest(
  requestId: number,
  currentRequestId: number,
  selectedDreamId: string | null,
  responseDreamId: string,
): boolean {
  return requestId === currentRequestId
    && selectedDreamId !== null
    && selectedDreamId === responseDreamId;
}

export function mapArchiveMessages(
  dreamId: string,
  messages: DreamArchiveMessage[],
  offset = 0,
): DreamMessage[] {
  return messages.map((message, index) => mapCanonicalDreamMessage({
    id: `replay:${dreamId}:${offset + index}`,
    role: message.role === 'assistant' ? 'her' : 'user',
    text: message.content,
    segments: message.segments,
    segmentedContent: message.segmented_content,
  }));
}
