import { describe, expect, it, vi } from 'vitest';
import { getStageControls, registerStageControls, subscribeStageControls, type StageControls } from './stageControls';

describe('window-local preview lifecycle', () => {
  it('does not let stale model cleanup remove a newly registered model', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStageControls(listener);
    const controls = (model: string): StageControls => ({ model, expressions: [], motions: [], actions: [],
      playExpression: vi.fn(), playMotion: vi.fn(), playAction: vi.fn(), stop: vi.fn() });
    const first = registerStageControls(controls('first'));
    const second = registerStageControls(controls('second'));
    first();
    expect(getStageControls()?.model).toBe('second');
    second();
    expect(getStageControls()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
