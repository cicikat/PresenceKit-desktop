import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDriver, getExpressionNames, getMotionGroupNames, getParamDefault } from './motionAdapter';

afterEach(() => vi.restoreAllMocks());

describe('Live2D motion adapter', () => {
  it('preserves native update, drives a frame, and detaches', () => {
    const native = vi.fn((_coreModel: unknown, _now: number) => true);
    const manager = { update: native };
    const model = { internalModel: { motionManager: manager } };
    const drive = vi.fn();
    const detach = attachDriver(model, drive);
    expect(detach).toBeTypeOf('function');
    expect(manager.update({}, 12)).toBe(true);
    expect(native).toHaveBeenCalledOnce();
    expect(drive).toHaveBeenCalledWith({}, 12);
    detach?.();
    expect(manager.update).toBe(native);
  });

  it('fails open with a warning when internals are incompatible', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(attachDriver({}, vi.fn())).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('可能因 pixi-live2d-display 库升级导致'));
  });

  it('isolates expression, motion group, and parameter shape probing', () => {
    const model = { internalModel: { motionManager: {
      expressionManager: { definitions: [{ Name: 'Happy' }] },
      definitions: { Idle: [], Tap: [] },
    } } };
    expect(getExpressionNames(model)).toEqual(['Happy']);
    expect(getMotionGroupNames(model)).toEqual(['Idle', 'Tap']);
    expect(getParamDefault({ getParameterIndex: () => 0, getParameterDefaultValue: () => 0.75 }, 'ParamX')).toBe(0.75);
    expect(getParamDefault({}, 'ParamEyeLOpen')).toBe(1);
  });
});