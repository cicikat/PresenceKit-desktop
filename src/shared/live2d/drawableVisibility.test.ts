import { describe, expect, it } from 'vitest';
import { attachDrawableVisibility } from './drawableVisibility';

describe('asset-defined accessory overlays', () => {
  it('keeps native opacities and source eyes intact while switching shared-part overlays', () => {
    let expression: string | null = null;
    const values = [.8, .7, .9];
    const opacity = (index: number) => values[index];
    const core = { getModel: () => ({ drawables: { ids: ['eye', 'glasses', 'mask'] } }), getDrawableOpacity: opacity };
    const detach = attachDrawableVisibility({ internalModel: { coreModel: core } }, {
      defaultHidden: ['glasses', 'mask'], byExpression: { glasses: ['mask'], mask: ['glasses'], none: ['glasses', 'mask'] },
    }, () => expression);
    expect([0, 1, 2].map(i => core.getDrawableOpacity(i))).toEqual([.8, 0, 0]);
    expression = 'glasses';
    expect([0, 1, 2].map(i => core.getDrawableOpacity(i))).toEqual([.8, .7, 0]);
    expression = 'native-smile';
    expect(core.getDrawableOpacity(1)).toBe(.7);
    expression = 'mask';
    expect([0, 1, 2].map(i => core.getDrawableOpacity(i))).toEqual([.8, 0, .9]);
    expression = 'none';
    expect(core.getDrawableOpacity(2)).toBe(0);
    expect(values).toEqual([.8, .7, .9]);
    detach();
    expect(core.getDrawableOpacity).toBe(opacity);
  });

  it('does not alter existing models without an explicit visibility contract', () => {
    const opacity = () => 1;
    const core = { getModel: () => ({ drawables: { ids: ['eye'] } }), getDrawableOpacity: opacity };
    attachDrawableVisibility({ internalModel: { coreModel: core } }, undefined, () => null)();
    expect(core.getDrawableOpacity).toBe(opacity);
    expect(() => attachDrawableVisibility({}, { defaultHidden: [], byExpression: {} }, () => null)()).not.toThrow();
  });
});
