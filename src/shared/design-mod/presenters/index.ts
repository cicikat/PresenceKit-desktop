import type { StateEngine } from '../../state/store';
import type { ToolStatusOverlayState } from '../../state/toolStatusOverlay';
import { DiaryPresenterController } from './diary';
import { FlowPresenterController } from './flow';
import { GardenPresenterController } from './garden';
import { SharedStatePollingController } from './polling';
import { StatusPresenterController } from './status';
import type { DiaryPresenter, FlowPresenter, GardenPresenter, StatusPresenter } from './types';

export interface SidebarPresenters {
  readonly status: StatusPresenter;
  readonly flow: FlowPresenter;
  readonly garden: GardenPresenter;
  readonly diary: DiaryPresenter;
  setPaused(paused: boolean): void;
  setToolStatus(status: ToolStatusOverlayState | null): void;
  getDiagnostics(): Record<string, { schemaVersion?: number; consumerCount: number; active: boolean; timerActive: boolean; updatedAt: number }>;
  subscribeDiagnostics(listener: () => void): () => void;
  dispose(): void;
}

export function createSidebarPresenters(engine: StateEngine): SidebarPresenters {
  const statePolling = new SharedStatePollingController(engine);
  const releaseBackgroundState = statePolling.acquire('chat-window.background', { moodMs: 120_000, activityMs: 180_000 });
  const status = new StatusPresenterController(engine, statePolling);
  const flow = new FlowPresenterController(engine, statePolling);
  const garden = new GardenPresenterController(engine);
  const diary = new DiaryPresenterController(engine);
  const all = [status, flow, garden, diary];
  const diagnosticsListeners = new Set<() => void>();
  const unsubscribeDiagnostics = all.map(presenter => presenter.subscribeDiagnostics(() => diagnosticsListeners.forEach(listener => listener())));
  return {
    status,
    flow,
    garden,
    diary,
    setPaused(paused) {
      statePolling.setPaused(paused);
      all.forEach(presenter => presenter.setPaused(paused));
    },
    setToolStatus(statusOverlay) { flow.setToolStatus(statusOverlay); },
    getDiagnostics() {
      return {
        polling: statePolling.getDiagnostics(),
        status: status.getDiagnostics(),
        flow: flow.getDiagnostics(),
        garden: garden.getDiagnostics(),
        diary: diary.getDiagnostics(),
      };
    },
    subscribeDiagnostics(listener) {
      diagnosticsListeners.add(listener);
      return () => diagnosticsListeners.delete(listener);
    },
    dispose() {
      unsubscribeDiagnostics.forEach(unsubscribe => unsubscribe());
      diagnosticsListeners.clear();
      all.forEach(presenter => presenter.dispose());
      releaseBackgroundState();
      statePolling.dispose();
    },
  };
}

export * from './base';
export * from './constants';
export * from './flow';
export * from './garden';
export * from './diary';
export * from './polling';
export * from './react';
export * from './status';
export * from './types';
