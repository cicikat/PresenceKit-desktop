import type { DreamStatus } from '../../shared/api/dream-types';

export interface ObservedDreamStatus {
  dreamId: string;
  status: Extract<DreamStatus, 'DREAM_ACTIVE' | 'DREAM_EXIT_REQUESTED'>;
}

const CLOSED_STATUSES: ReadonlySet<DreamStatus> = new Set([
  'DREAM_CLOSING',
  'REALITY_AFTERGLOW',
  'REALITY_CHAT',
]);

/** True only for a real observed Dream -> closed/reality transition. */
export function shouldAutoCloseDream(
  observed: ObservedDreamStatus | null,
  next: { status: DreamStatus; dreamId?: string | null },
): boolean {
  return Boolean(
    observed
    && observed.dreamId
    && observed.status
    && CLOSED_STATUSES.has(next.status)
    && (!next.dreamId || next.dreamId === observed.dreamId),
  );
}
