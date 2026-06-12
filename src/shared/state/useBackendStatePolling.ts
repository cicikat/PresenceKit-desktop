import { useCallback, useEffect, useRef, useState } from 'react';
import { loadActivityState, loadMoodState } from '../api/backend';
import type { ActivityState } from '../api/types';
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

  useEffect(() => {
    pollingRunRef.current += 1;
    setMoodError(null);
    setActivityError(null);
    return () => {
      pollingRunRef.current += 1;
    };
  }, [cadence]);

  const fetchMood = useCallback(async () => {
    const pollingRun = pollingRunRef.current;
    try {
      const raw = await loadMoodState();
      engine.applyBackendState('mood-poll', { mood: backendMoodToFrontend(raw.current) });
      if (pollingRun === pollingRunRef.current) setMoodError(null);
    } catch (error) {
      if (pollingRun === pollingRunRef.current) setMoodError(String(error));
    }
  }, [engine]);

  const fetchActivity = useCallback(async () => {
    const pollingRun = pollingRunRef.current;
    try {
      const raw: ActivityState = await loadActivityState();
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
    }
  }, [engine]);

  useEffect(() => {
    if (!cadence) return;
    fetchMood();
    const interval = setInterval(fetchMood, cadence.moodMs);
    return () => clearInterval(interval);
  }, [cadence, fetchMood]);

  useEffect(() => {
    if (!cadence) return;
    fetchActivity();
    const interval = setInterval(fetchActivity, cadence.activityMs);
    return () => clearInterval(interval);
  }, [cadence, fetchActivity]);

  return {
    moodError,
    activityError,
    retryMood: fetchMood,
    retryActivity: fetchActivity,
  };
}
