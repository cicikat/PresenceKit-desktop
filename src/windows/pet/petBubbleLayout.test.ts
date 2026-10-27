import { describe, expect, it } from 'vitest';
import { petBubbleLayout } from './petBubbleLayout';

const area = { x: 0, y: 0, width: 1920, height: 1080 };
const anchor = (x: number, y = 100) => ({ x, y, width: 340, height: 400 });
describe('pet side bubble geometry', () => {
  it('opens toward free space and preserves the stage screen anchor on either side', () => {
    for (const x of [10, 1400]) {
      const r = petBubbleLayout(anchor(x), area, 1, 1, true);
      expect(r.side).toBe(x < 500 ? 'right' : 'left');
      expect(r.x + r.petLeft).toBe(x);
      expect(r.stageWidth).toBe(340);
      const hidden = petBubbleLayout({ ...anchor(x), x: r.x + r.petLeft }, area, 1, 1, false, r.side);
      expect(hidden.x).toBe(x);
      expect(hidden.width).toBe(340);
    }
  });
  it('handles negative monitor coordinates and scaled physical pixels', () => {
    const a = { x: -2560, y: -300, width: 2560, height: 1440 };
    const r = petBubbleLayout({ x: -800, y: 900, width: 510, height: 600 }, a, 1, 1.5, true);
    expect(r.side).toBe('left');
    expect(r.x + r.petLeft).toBe(-800);
    expect(r.stageWidth).toBe(510);
    expect(r.y + r.height).toBe(a.y + a.height);
  });
  it('keeps the whole wing on a narrow display and clamps offscreen windows', () => {
    const r = petBubbleLayout(anchor(900, -200), { ...area, width: 500 }, 1, 1, true);
    expect(r.wing).toBe(160);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(500);
  });
  it('retains the chosen side around the midpoint, and preserves the anchor when switching', () => {
    const x = area.width / 2 - 170;
    expect(petBubbleLayout(anchor(x), area, 1, 1, true, 'left').side).toBe('left');
    expect(petBubbleLayout(anchor(x), area, 1, 1, true, 'right').side).toBe('right');
    const r = petBubbleLayout(anchor(x + 40), area, 1, 1, true, 'right');
    expect(r.side).toBe('left');
    expect(r.x + r.petLeft).toBe(x + 40);
  });
  it('scales the canvas independently of the additional bubble space', () => {
    const r = petBubbleLayout(anchor(20), area, 2, 1, true);
    expect(r.stageWidth).toBe(680);
    expect(r.height).toBe(800);
    expect(r.width).toBe(1280);
  });
});
