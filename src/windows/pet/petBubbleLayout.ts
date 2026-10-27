export interface PetRect { x: number; y: number; width: number; height: number }
export type BubbleSide = 'left' | 'right';

/** All coordinates are physical pixels, including monitors left of the primary. */
export function petBubbleLayout(anchor: PetRect, area: PetRect, scale: number, dpi: number, visible: boolean, previous: BubbleSide = 'right') {
  const width = Math.round(340 * scale * dpi);
  const height = Math.round(400 * scale * dpi);
  const center = anchor.x + anchor.width / 2;
  const middle = area.x + area.width / 2;
  // Hysteresis keeps the tail from oscillating during slow movement at the midpoint.
  const side: BubbleSide = center < middle - 24 * dpi ? 'right' : center > middle + 24 * dpi ? 'left' : previous;
  const wing = visible ? Math.max(0, Math.min(Math.round(300 * scale * dpi), area.width - width)) : 0;
  const petLeft = side === 'left' ? wing : 0;
  const x = Math.max(area.x, Math.min(area.x + Math.max(0, area.width - width - wing), anchor.x - petLeft));
  const y = Math.max(area.y, Math.min(area.y + Math.max(0, area.height - height), anchor.y));
  return { x, y, width: width + wing, height, petLeft, stageWidth: width, wing, side };
}
