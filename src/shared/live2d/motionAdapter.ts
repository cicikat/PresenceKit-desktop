/**
 * Compatibility boundary for pixi-live2d-display-lipsyncpatch@0.5.0-ls-8.
 * Internal library shapes are intentionally isolated here so an upgrade fails open.
 */
export type CoreModel = {
  getParameterIndex?: (id: string) => number;
  getParameterDefaultValue?: (index: number) => number;
  getModel?: () => { parameters?: { ids?: string[]; defaultValues?: number[] } };
  parameters?: { ids?: string[]; defaultValues?: number[] };
};

type MotionManager = {
  update?: (coreModel: CoreModel, now: number) => boolean;
  expressionManager?: { definitions?: { Name: string }[] };
  definitions?: Record<string, unknown[]>;
};
type ModelInternals = { internalModel?: { motionManager?: MotionManager; eyeBlink?: unknown } };

const INCOMPATIBLE_WARNING = '[live2d] motionManager 结构不符，驱动层禁用，模型以原生动作运行（可能因 pixi-live2d-display 库升级导致）';

export function disableBuiltinEyeBlink(model: unknown): void {
  const internal = (model as ModelInternals).internalModel;
  if (internal) internal.eyeBlink = undefined;
}

export function attachDriver(
  model: unknown,
  driveFrame: (coreModel: CoreModel, now: number) => void,
): (() => void) | null {
  const manager = (model as ModelInternals).internalModel?.motionManager;
  if (!manager || typeof manager.update !== 'function') {
    console.warn(INCOMPATIBLE_WARNING);
    return null;
  }
  const original = manager.update;
  const patched = function (this: MotionManager, coreModel: CoreModel, now: number): boolean {
    const changed = original.call(this, coreModel, now);
    try {
      driveFrame(coreModel, now);
    } catch {
      // fail-open: a missing model parameter must not stop native motions
    }
    return changed;
  };
  manager.update = patched;
  return () => {
    if (manager.update === patched) manager.update = original;
  };
}

export function getExpressionNames(model: unknown): string[] {
  return (model as ModelInternals).internalModel?.motionManager?.expressionManager?.definitions
    ?.map(definition => definition.Name)
    .filter((name): name is string => typeof name === 'string') ?? [];
}

export function getMotionGroupNames(model: unknown): string[] {
  return Object.keys((model as ModelInternals).internalModel?.motionManager?.definitions ?? {});
}
export function getModelHeight(model: unknown): number {
  const candidate = model as ModelInternals & { height?: number; internalModel?: { height?: number; motionManager?: MotionManager; eyeBlink?: unknown } };
  return candidate.internalModel?.height || candidate.height || 1;
}

export function getParamDefault(coreModel: CoreModel, id: string): number {
  const ids = coreModel.parameters?.ids ?? coreModel.getModel?.()?.parameters?.ids;
  const index = coreModel.getParameterIndex?.(id) ?? ids?.indexOf(id) ?? -1;
  if (index < 0) return id === 'ParamEyeLOpen' || id === 'ParamEyeROpen' ? 1 : 0;
  try {
    const value = coreModel.getParameterDefaultValue?.(index);
    if (Number.isFinite(value)) return value as number;
  } catch {
    // fall through to raw model data
  }
  const defaults = coreModel.parameters?.defaultValues ?? coreModel.getModel?.()?.parameters?.defaultValues;
  const value = defaults?.[index];
  if (Number.isFinite(value)) return value as number;
  return id === 'ParamEyeLOpen' || id === 'ParamEyeROpen' ? 1 : 0;
}