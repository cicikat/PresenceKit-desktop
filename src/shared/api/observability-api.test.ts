import { describe, expect, it } from 'vitest';
import { droppedReasons, trendOf, visualHeat } from './observability-api';

describe('observability helpers', () => {
  it('detects progress direction', () => {
    expect(trendOf([0.2, 0.4, 0.8])).toBe('up');
    expect(trendOf([0.8, 0.4])).toBe('down');
    expect(trendOf([0.5])).toBe('flat');
  });

  it('buckets accepted visual observations by local hour', () => {
    const ts = new Date(2026, 6, 14, 9, 0, 0).getTime() / 1000;
    const heat = visualHeat([{ ts }, { ts: ts + 30 }, { ts, dropped: 'cooldown' }]);
    expect(heat[9]).toBe(2);
    expect(heat.reduce((sum, value) => sum + value, 0)).toBe(2);
  });

  it('counts visual drop reasons', () => {
    expect(droppedReasons([
      { dropped: 'cooldown' },
      { dropped: 'cooldown' },
      { dropped: 'sensitive' },
      { caption: 'accepted' },
    ])).toEqual({ cooldown: 2, sensitive: 1 });
  });
});
