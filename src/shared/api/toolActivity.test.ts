import { describe, expect, it } from 'vitest';
import { isToolActivity, mergeToolActivity, type ToolActivity } from './toolActivity';
const first: ToolActivity = { type: 'tool_activity', event_id: 'a', chain_id: 'chain', char_id: 'char', source: 'reality', origin: 'autonomy', tool_name: 'get_time', status: 'running', ts: 1 };
describe('tool activity receipts', () => {
  it('validates scope and status without accepting malformed frames', () => {
    expect(isToolActivity(first)).toBe(true);
    expect(isToolActivity({ ...first, status: 'ok' })).toBe(false);
    expect(isToolActivity({ ...first, char_id: '' })).toBe(false);
    expect(isToolActivity({ ...first, ts: NaN })).toBe(false);
  });
  it('updates a call without duplication and never regresses terminal state', () => {
    const done = { ...first, status: 'success' as const };
    expect(mergeToolActivity([first], done)).toEqual([done]);
    expect(mergeToolActivity([done], first)).toEqual([done]);
    expect(mergeToolActivity([done], { ...first, event_id: 'b' })).toHaveLength(2);
  });
});
