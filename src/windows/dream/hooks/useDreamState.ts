import { useState, useEffect, useCallback, useRef } from 'react';
import { dreamGetState } from '../../../shared/api/dream';
import type { DreamState } from '../../../shared/api/dream-types';

const POLL_MS = 8_000;

export function useDreamState() {
  const [dreamState, setDreamState] = useState<DreamState | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await dreamGetState();
      console.debug('[Dream] getState ok:', s.status, s);
      if (mountedRef.current) {
        setDreamState(s);
        setStateError(null);
      }
    } catch (e) {
      console.debug('[Dream] getState error:', e);
      if (mountedRef.current) {
        setStateError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  return { dreamState, stateError, refresh };
}
