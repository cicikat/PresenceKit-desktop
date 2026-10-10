import { emit } from '@tauri-apps/api/event';
import { BEHAVIOR_EVENT, type BehaviorNotice } from './behaviorState';

/** Presentation failure never blocks the real request/audio pipeline. */
export async function publishBehavior(event: BehaviorNotice): Promise<void> {
  try { await emit(BEHAVIOR_EVENT, event); }
  catch (error) { console.warn('[character] behavior event unavailable:', error); }
}
