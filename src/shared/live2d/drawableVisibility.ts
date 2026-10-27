/** Asset-defined render-only masks for optional overlays that share one Cubism part. */
export interface DrawableVisibility {
  defaultHidden: string[];
  byExpression: Record<string, string[]>;
}

export function attachDrawableVisibility(
  model: unknown,
  visibility: DrawableVisibility | undefined,
  getExpression: () => string | null,
): () => void {
  type Core = { getDrawableOpacity: (index: number) => number; getModel: () => { drawables: { ids: string[] } } };
  const core = (model as { internalModel?: { coreModel?: Core } })?.internalModel?.coreModel;
  if (!visibility || !core || typeof core.getDrawableOpacity !== 'function' || typeof core.getModel !== 'function') return () => {};
  const ids = core.getModel().drawables.ids;
  const opacity = core.getDrawableOpacity;
  let lastExpression: string | null = null;
  let hidden = new Set(visibility.defaultHidden);
  const wrapped = (index: number) => {
    const expression = getExpression();
    if (expression !== lastExpression) {
      lastExpression = expression;
      if (expression && Object.prototype.hasOwnProperty.call(visibility.byExpression, expression)) {
        hidden = new Set(visibility.byExpression[expression]);
      }
    }
    return hidden.has(ids[index]) ? 0 : opacity.call(core, index);
  };
  core.getDrawableOpacity = wrapped;
  return () => { if (core.getDrawableOpacity === wrapped) core.getDrawableOpacity = opacity; };
}
