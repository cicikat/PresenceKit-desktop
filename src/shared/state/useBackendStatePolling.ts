import { useCallback, useEffect, useRef, useState } from 'react';
import { loadActivityState, loadMoodState } from '../api/backend';
import { classifyHttpError } from '../api/httpError';
import { normalizeActivityState } from '../api/stateResponseNormalization';
import { backendMoodToFrontend } from './mood-mapping';
import type { StateEngine } from './store';

export interface BackendStatePollingCadence {
  moodMs: number;
  activityMs: number;
}

export interface BackendStatePollingControls {
  moodError: string | null;
  activityError: string | null;
  retryMood: () => void;
  retryActivity: () => void;
}

export const FLOW_BACKEND_STATE_CADENCE: BackendStatePollingCadence = {
  moodMs: 60_000,
  activityMs: 90_000,
};

export const STATUS_BACKEND_STATE_CADENCE: BackendStatePollingCadence = {
  moodMs: 30_000,
  activityMs: 60_000,
};

export function useBackendStatePolling(
  engine: StateEngine,
  cadence: BackendStatePollingCadence | null,
): BackendStatePollingControls {
  const [moodError, setMoodError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const pollingRunRef = useRef(0);
  const moodIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollingRunRef.current += 1;
    setMoodError(null);
    setActivityError(null);
    return () => {
      pollingRunRef.current += 1;
    };
  }, [cadence]);

  // 401 从不自动重试（重试不会让失效的 token 自己变好）：停掉对应轮询的 interval，直到
  // cadence 变化（例如面板重新打开触发 effect 重跑）或手动 retryMood/retryActivity 才恢复
  // （cc-tasks/35 §2）。
  const fetchMood = useCallback(async () => {
    const pollingRun = pollingRunRef.current;
    try {
      const raw = await loadMoodState();
      engine.applyBackendState('mood-poll', { mood: backendMoodToFrontend(raw.current) });
      if (pollingRun === pollingRunRef.current) setMoodError(null);
    } catch (error) {
      if (pollingRun === pollingRunRef.current) setMoodError(String(error));
      if (classifyHttpError(error).kind === 'unauthorized' && moodIntervalRef.current !== null) {
        clearInterval(moodIntervalRef.current);
        moodIntervalRef.current = null;
      }
    }
  }, [engine]);

  const fetchActivity = useCallback(async () => {
    const pollingRun = pollingRunRef.current;
    try {
      const raw = normalizeActivityState(await loadActivityState());
      if (!raw) throw new Error('活动状态响应格式无效');
      engine.applyBackendState('activity-poll', {
        activity: {
          id: raw.id,
          text: raw.text,
          arc: raw.arc,
          thinkingAboutEligible: raw.thinking_about_eligible,
        },
      });
      if (pollingRun === pollingRunRef.current) setActivityError(null);
    } catch (error) {
      if (pollingRun === pollingRunRef.current) setActivityError(String(error));
      if (classifyHttpError(error).kind === 'unauthorized' && activityIntervalRef.current !== null) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }
    }
  }, [engine]);

  useEffect(() => {
    if (!cadence) return;
    fetchMood();
    moodIntervalRef.current = setInterval(fetchMood, cadence.moodMs);
    return () => {
      if (moodIntervalRef.current !== null) clearInterval(moodIntervalRef.current);
      moodIntervalRef.current = null;
    };
  }, [cadence, fetchMood]);

  useEffect(() => {
    if (!cadence) return;
    fetchActivity();
    activityIntervalRef.current = setInterval(fetchActivity, cadence.activityMs);
    return () => {
      if (activityIntervalRef.current !== null) clearInterval(activityIntervalRef.current);
      activityIntervalRef.current = null;
    };
  }, [cadence, fetchActivity]);

  return {
    moodError,
    activityError,
    retryMood: fetchMood,
    retryActivity: fetchActivity,
  };
}
