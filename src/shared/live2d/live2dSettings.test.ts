import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../uiPreferences', () => ({ getUIPref: () => state.value,
  setUIPref: (_key: string, value: Record<string, unknown>) => { state.value = value; } }));
import { loadLive2DSettings, patchLive2DSettings } from './live2dSettings';

beforeEach(() => { state.value = {}; vi.stubGlobal('window', { dispatchEvent: vi.fn() }); });
describe('call placement migration', () => {
  it('preserves old appearance then lets calls move independently of Pet', () => {
    state.value = { scaleMul: 1.4, offset: [0.1, -0.2] };
    expect(loadLive2DSettings().callScaleMul).toBe(1.4);
    expect(loadLive2DSettings().callOffset).toEqual([0.1, -0.2]);
    patchLive2DSettings({ callScaleMul: 2, callOffset: [-0.3, 0.2] });
    const current = loadLive2DSettings();
    expect(current.scaleMul).toBe(1.4);
    expect(current.offset).toEqual([0.1, -0.2]);
    expect(current.callScaleMul).toBe(2);
    expect(current.callOffset).toEqual([-0.3, 0.2]);
  });
  it('clamps call scale and translation without damaging background selection', () => {
    state.value = { bgKind: 'image', bgImage: '/legacy.jpg' };
    patchLive2DSettings({ callScaleMul: 999, callOffset: [5, -5] });
    expect(loadLive2DSettings().callScaleMul).toBe(8);
    expect(loadLive2DSettings().callOffset).toEqual([1, -1]);
    expect(loadLive2DSettings().bgImage).toBe('/legacy.jpg');
  });
});
