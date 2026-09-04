import { describe, expect, it, vi } from 'vitest';
import { browserCapabilityState, canAgentRuntimeTaskAction, classifyAgentRuntimeError, isAgentRuntimeScopeCurrent, normalizeAgentRuntimeTaskSnapshot, createAgentRuntimeBrowserTask, loadAgentRuntimeTasks, confirmAgentRuntimeBrowserTask, pauseAgentRuntimeBrowserTask, cancelAgentRuntimeTask } from './agent-runtime';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

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
    expect(browserCapabilityState({ enabled: false, adapter_available: false, effective_state: 'disabled_remote_server' } as any)).toBe('remote_disabled');
  });

  it('keeps task controls bounded to lifecycle states', () => {
    expect(canAgentRuntimeTaskAction('waiting_confirm', 'confirm')).toBe(true);
    expect(canAgentRuntimeTaskAction('paused', 'confirm')).toBe(false);
    expect(canAgentRuntimeTaskAction('queued', 'pause')).toBe(true);
    expect(canAgentRuntimeTaskAction('running', 'pause')).toBe(true);
    expect(canAgentRuntimeTaskAction('succeeded', 'cancel')).toBe(false);
    expect(canAgentRuntimeTaskAction('outcome_unknown', 'cancel')).toBe(false);
  });

  it('maps bridge failures to stable lifecycle error classes', () => {
    expect(classifyAgentRuntimeError('HTTP 401: token invalid')).toBe('unauthorized');
    expect(classifyAgentRuntimeError('HTTP 403: scope missing')).toBe('forbidden');
    expect(classifyAgentRuntimeError('HTTP 404')).toBe('unsupported');
    expect(classifyAgentRuntimeError('HTTP 409')).toBe('conflict');
    expect(classifyAgentRuntimeError('HTTP 422|code=task_request_mismatch|retryable=false|message=rejected')).toBe('rejected');
    expect(classifyAgentRuntimeError('连接失败')).toBe('network');
  });

  it('rejects stale role generations before writing async results', () => {
    expect(isAgentRuntimeScopeCurrent(2, 2, 'char-a', 'char-a')).toBe(true);
    expect(isAgentRuntimeScopeCurrent(1, 2, 'char-a', 'char-a')).toBe(false);
    expect(isAgentRuntimeScopeCurrent(2, 2, 'char-a', 'char-b')).toBe(false);
    expect(isAgentRuntimeScopeCurrent(2, 2, '', '')).toBe(false);
  });

  it('normalizes every lifecycle status and bounded receipt metadata', () => {
    const statuses = ['queued', 'running', 'waiting_confirm', 'paused', 'succeeded', 'failed', 'canceled', 'expired', 'outcome_unknown'];
    const result = normalizeAgentRuntimeTaskSnapshot({ entries: statuses.map((status, index) => ({ task_id: `task-${index}`, status, created_at: 1, queued_at: 2, started_at: 3, finished_at: 4, attempt_count: index, error_code: status === 'failed' ? 'browser_operation_failed' : null, result_metadata: { artifact_ids: ['browser_receipt_01'], truncated: true, path: 'C:/must-not-render' } })) });
    expect(result.tasks.map(task => task.status)).toEqual(statuses);
    expect(result.tasks.every(task => task.truncated)).toBe(true);
    expect(result.tasks[0].artifacts?.[0]).toMatchObject({ id: 'browser_receipt_01', truncated: true });
    expect(result.tasks[0].artifacts?.[0]).not.toHaveProperty('path');
  });

  it('uses the shared bridge for task mutations and scoped queries', async () => {
    invokeMock.mockResolvedValue({ task_id: 't1', status: 'queued' });
    await createAgentRuntimeBrowserTask({ charId: 'char-a', url: 'https://example.test', operation: 'click', idempotencyKey: 'once', params: { selector: '#continue' } });
    expect(invokeMock).toHaveBeenCalledWith('create_agent_runtime_browser_task', expect.objectContaining({ charId: 'char-a', idempotencyKey: 'once', params: { selector: '#continue' } }));
    await loadAgentRuntimeTasks({ charId: 'char-a', capability: 'browser.automation' });
    expect(invokeMock).toHaveBeenCalledWith('load_agent_runtime_tasks', expect.objectContaining({ charId: 'char-a', capability: 'browser.automation' }));
    await confirmAgentRuntimeBrowserTask('t1', 'char-a');
    await pauseAgentRuntimeBrowserTask('t1', 'char-a');
    await cancelAgentRuntimeTask('t1', 'char-a');
    expect(invokeMock).toHaveBeenCalledWith('confirm_agent_runtime_browser_task', { taskId: 't1', charId: 'char-a' });
    expect(invokeMock).toHaveBeenCalledWith('pause_agent_runtime_browser_task', { taskId: 't1', charId: 'char-a' });
    expect(invokeMock).toHaveBeenCalledWith('cancel_agent_runtime_task', { taskId: 't1', charId: 'char-a' });
  });
});
