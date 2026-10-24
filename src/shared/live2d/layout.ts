export const MIN_LIVE2D_SCALE = 0.2;
export const MAX_LIVE2D_SCALE = 8;

export function wheelScale(current: number, delta: number, mode: number, pageHeight: number): number {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
  return Math.max(MIN_LIVE2D_SCALE, Math.min(MAX_LIVE2D_SCALE,
    current * Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.0015)));
}

/** Anchor is a model-local offset from its centered pivot, normalized by model height. */
export function anchoredLayout(width: number, height: number, modelHeight: number,
  scaleMul: number, zoom: number, offset: [number, number], head: { x: number; y: number; width?: number; height?: number }) {
  const baselineHeight = height * 0.95;
  const margin = Math.max(8, Math.min(width, height) * 0.025);
  let targetHeight = baselineHeight * scaleMul * zoom;
  if (head.width && head.height) {
    // A very small window may not fit an entire head at the requested zoom. Preserve the head.
    targetHeight = Math.min(targetHeight, Math.max(1, width - margin * 2) / head.width,
      Math.max(1, height - margin * 2) / head.height);
  }
  const halfWidth = (head.width ?? 0) * targetHeight / 2;
  const halfHeight = (head.height ?? 0) * targetHeight / 2;
  const headX = Math.max(margin + halfWidth, Math.min(width - margin - halfWidth, width / 2 + head.x * baselineHeight));
  const headY = Math.max(margin + halfHeight, Math.min(height - margin - halfHeight, height / 2 + head.y * baselineHeight));
  return { scale: targetHeight / modelHeight,
    x: headX - head.x * targetHeight + offset[0] * width,
    y: headY - head.y * targetHeight + offset[1] * height };
}
