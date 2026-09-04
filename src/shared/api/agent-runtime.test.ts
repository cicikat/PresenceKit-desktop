import { describe, expect, it } from 'vitest';
import { browserCapabilityState, normalizeAgentRuntimeTaskSnapshot } from './agent-runtime';

describe('agent runtime browser metadata', () => {
  it('keeps unknown task states unknown and drops unsafe fields', () => {
    const result = normalizeAgentRuntimeTaskSnapshot({ tasks: [{ task_id: 't1', status: 'wat', token: 'secret', artifacts: [{ label: 'result', path: 'C:/secret' }] }] });
    expect(result.tasks[0]).toMatchObject({ task_id: 't1', status: 'unknown' });
    expect(result.tasks[0]).not.toHaveProperty('token');
    expect(result.tasks[0].artifacts?.[0]).not.toHaveProperty('path');
  });

  it('maps disabled and unavailable capability states without implying success', () => {
    expect(browserCapabilityState({ enabled: false, adapter_available: true } as any)).toBe('disabled');
    expect(browserCapabilityState({ enabled: true, adapter_available: false } as any)).toBe('unavailable');
  });

  it('normalizes every lifecycle status and bounded receipt metadata', () => {
    const statuses = ['queued', 'running', 'waiting_confirm', 'paused', 'succeeded', 'failed', 'canceled', 'expired', 'outcome_unknown'];
    const result = normalizeAgentRuntimeTaskSnapshot({ entries: statuses.map((status, index) => ({ task_id: `task-${index}`, status, created_at: 1, queued_at: 2, started_at: 3, finished_at: 4, attempt_count: index, error_code: status === 'failed' ? 'browser_operation_failed' : null, result_metadata: { label: 'safe-result', truncated: true, path: 'C:/must-not-render' } })) });
    expect(result.tasks.map(task => task.status)).toEqual(statuses);
    expect(result.tasks.every(task => task.truncated)).toBe(true);
    expect(result.tasks[0].artifacts?.[0]).toMatchObject({ label: 'safe-result', truncated: true });
    expect(result.tasks[0].artifacts?.[0]).not.toHaveProperty('path');
  });
});
