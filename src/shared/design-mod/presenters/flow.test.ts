import { describe, expect, it } from 'vitest';
import { appendFlowTimeline, buildFlowNarrative, FLOW_TIMELINE_WINDOW_MS, pruneFlowTimeline } from './flowPure';

describe('flow presenter timeline', () => {
  it('deduplicates the same current wording and keeps an eight hour window', () => {
    const state = { activity: { id: 'read', text: '读书', arc: '', thinkingAboutEligible: false }, focus: '看你', mood: '平静' } as const;
    const first = appendFlowTimeline([], state, 10_000);
    const duplicate = appendFlowTimeline(first, state, 20_000);
    expect(duplicate).toEqual(first);
    const old = { ...first[0], id: 'old', timestamp: 20_000 - FLOW_TIMELINE_WINDOW_MS - 1 };
    expect(pruneFlowTimeline([old, ...first], 20_000)).toEqual(first);
  });

  it('preserves presence-specific narrative and book substitution', () => {
    expect(buildFlowNarrative({ id: 'watching_you', text: '在发呆' }, '看你', 'active')).toContain('看着你');
    expect(buildFlowNarrative({ id: 'read', text: '{book}' }, '看屏幕', 'idle')).toContain('读着书');
    expect(buildFlowNarrative(null, '看你', 'away')).toBe('他不在。');
  });
});
