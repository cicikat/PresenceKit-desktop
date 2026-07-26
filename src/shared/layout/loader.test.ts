import { describe, expect, it } from 'vitest';
import { validateLayout } from './loader';

const validLayout = {
  id: 'test-layout', name: 'Test layout', author: 'test', version: '1', direction: 'row',
  slots: { ribbon: { order: 0, size: 52 }, sidebar: { order: 1, size: 340 }, main: { order: 2 } },
};

describe('validateLayout', () => {
  it('accepts a complete layout manifest', () => {
    expect(validateLayout(validLayout)).toEqual([]);
  });

  it('rejects missing slots, invalid direction, and hidden non-sidebar slots', () => {
    expect(validateLayout({ ...validLayout, slots: { ribbon: { order: 0 }, sidebar: { order: 1 } } })).not.toEqual([]);
    expect(validateLayout({ ...validLayout, direction: 'column' })).not.toEqual([]);
    expect(validateLayout({ ...validLayout, slots: { ...validLayout.slots, main: { order: 2, hidden: true } } })).toContain('main 不允许 hidden');
  });
});
