import { describe, expect, it } from 'vitest';
import { getDesignModHostLayoutState, type DesignModHostPhase } from './hostLayout';

describe('design Mod host layout contract', () => {
  it.each([
    ['builtin-default', true, false],
    ['loading', true, false],
    ['active', false, true],
    ['error', true, false],
  ] as const)('%s keeps one viewport size contract', (phase: DesignModHostPhase, defaultVisible, modVisible) => {
    const state = getDesignModHostLayoutState(phase);

    expect(state.defaultShellVisible).toBe(defaultVisible);
    expect(state.modLayerVisible).toBe(modVisible);
    expect(state.defaultShellInteractive).toBe(defaultVisible);
    expect(state.modLayerInteractive).toBe(modVisible);
    expect(state.size).toEqual({ width: '100%', height: '100%', minWidth: 0, minHeight: 0 });
  });
});
