import { useCallback, useState } from 'react';
import { browserCapabilityState, loadAgentRuntimeTasks, loadBrowserCapability, normalizeAgentRuntimeTaskSnapshot, type AgentRuntimeTask, type BrowserCapabilitySnapshot } from '../../../shared/api/agent-runtime';
import { usePollingBackoff } from '../../../shared/api/backoffPoll';
import { useI18n } from '../../../shared/i18n';

const STATUS_KEYS = ['queued', 'running', 'waiting_confirm', 'paused', 'succeeded', 'failed', 'canceled', 'expired', 'outcome_unknown', 'unknown'] as const;

function replace(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

function formatTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function AgentRuntimeBrowserSettingsPage() {
  const { t } = useI18n();
  const [capability, setCapability] = useState<BrowserCapabilitySnapshot | null>(null);
  const [tasks, setTasks] = useState<AgentRuntimeTask[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [capabilityResult, taskResult] = await Promise.all([loadBrowserCapability(), loadAgentRuntimeTasks({ capability: 'browser.automation', limit: 20 })]);
      setCapability(capabilityResult);
      setTasks(normalizeAgentRuntimeTaskSnapshot(taskResult).tasks);
      setLoadError(null);
    } catch (error) {
      setLoadError(String(error));
      throw error;
    } finally {
      setInitialLoading(false);
    }
  }, []);
  const polling = usePollingBackoff(refresh, { baseIntervalMs: 30_000, maxBackoffMs: 120_000, enabled: true });

  if (initialLoading && !capability) return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('settings.agentRuntime.loading')}</div>;
  const state = capability ? browserCapabilityState(capability) : 'unavailable';
  const errorText = loadError ?? (polling.error ? `${t('settings.agentRuntime.error')}：${polling.error.message}` : null);
  return (
    <div style={{ display: 'grid', gap: 14 }} data-testid="agent-runtime-browser-settings">
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{t('settings.agentRuntime.title')}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.5, marginTop: 3 }}>{t('settings.agentRuntime.description')}</div>
      </div>
      {capability && (
        <div style={{ border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'grid', gap: 5, background: 'var(--paper-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{t('settings.agentRuntime.capability.label')}</span>
            <strong style={{ color: state === 'enabled' ? 'var(--accent-3)' : 'var(--danger)', fontSize: 12 }}>{t(`settings.agentRuntime.capability.${state}` as any)}</strong>
          </div>
          <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.capability.reason'), { reason: capability.reason_code || (capability.adapter_available ? '—' : 'adapter_unavailable') })}</div>
          <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.domains'), { count: capability.allowed_domain_count })} · {replace(t('settings.agentRuntime.worker'), { state: t(capability.adapter_available ? 'settings.agentRuntime.worker.ready' : 'settings.agentRuntime.worker.offline') })} · {t('settings.agentRuntime.credentials')}</div>
        </div>
      )}
      <div style={{ padding: '9px 11px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>{t('settings.agentRuntime.readOnly')}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tasks.length ? replace(t('settings.agentRuntime.taskCount'), { count: tasks.length }) : t('settings.agentRuntime.empty')}</span>
        <button type="button" onClick={() => { void polling.retryNow(); }} disabled={polling.backoffSeconds !== null} style={{ padding: '6px 10px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink-2)', cursor: 'pointer' }}>{t('settings.agentRuntime.refresh')}</button>
      </div>
      {errorText && <div className="mono" style={{ color: 'var(--danger)', fontSize: 10.5 }}>{errorText}</div>}
      {polling.backoffSeconds !== null && <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.retryIn'), { seconds: polling.backoffSeconds })}</div>}
      {tasks.length > 0 && <div style={{ display: 'grid', gap: 8 }}>
        {tasks.map(task => <TaskRow key={task.task_id} task={task} t={t} />)}
      </div>}
    </div>
  );
}

function TaskRow({ task, t }: { task: AgentRuntimeTask; t: (key: any) => string }) {
  const statusKey = STATUS_KEYS.includes(task.status as typeof STATUS_KEYS[number]) ? task.status : 'unknown';
  const resultLabel = task.artifacts?.find(item => item.label)?.label;
  return (
    <div style={{ border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'grid', gap: 6 }} data-task-status={statusKey}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{task.task_id}</span>
        <strong style={{ fontSize: 11.5, color: statusKey === 'failed' || statusKey === 'outcome_unknown' ? 'var(--danger)' : 'var(--ink-2)' }}>{t(`settings.agentRuntime.status.${statusKey}`)}</strong>
      </div>
      <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: 'var(--ink-3)', fontSize: 9.5 }}>
        <span>{replace(t('settings.agentRuntime.created'), { time: formatTime(task.created_at) })}</span><span>{replace(t('settings.agentRuntime.updated'), { time: formatTime(task.updated_at) })}</span>
        <span>{replace(t('settings.agentRuntime.attempts'), { count: task.attempt_count ?? 0 })}</span>
        {task.error_code && <span>{replace(t('settings.agentRuntime.errorCode'), { code: task.error_code })}</span>}
      </div>
      <div className="mono" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: 9.5 }}>
        <span>{replace(t('settings.agentRuntime.queued'), { time: formatTime(task.queued_at) })}</span><span>{replace(t('settings.agentRuntime.started'), { time: formatTime(task.started_at) })}</span><span>{replace(t('settings.agentRuntime.finished'), { time: formatTime(task.finished_at) })}</span>
      </div>
      {statusKey === 'waiting_confirm' && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{t('settings.agentRuntime.controlUnavailable')}</div>}
      {statusKey === 'outcome_unknown' && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{t('settings.agentRuntime.status.outcome_unknown')}</div>}
      {(statusKey === 'queued' || statusKey === 'running' || statusKey === 'waiting_confirm' || statusKey === 'paused') && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled title={t('settings.agentRuntime.controlUnavailable')} style={{ fontSize: 10, padding: '4px 7px', opacity: 0.55 }}>{t('settings.agentRuntime.control.pause')}</button>
          <button type="button" disabled title={t('settings.agentRuntime.controlUnavailable')} style={{ fontSize: 10, padding: '4px 7px', opacity: 0.55 }}>{t('settings.agentRuntime.control.cancel')}</button>
          <button type="button" disabled title={t('settings.agentRuntime.controlUnavailable')} style={{ fontSize: 10, padding: '4px 7px', opacity: 0.55 }}>{t('settings.agentRuntime.control.handoff')}</button>
        </div>
      )}
      {task.truncated && <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 9.5 }}>{t('settings.agentRuntime.truncated')}</span>}
      {resultLabel && <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{replace(t('settings.agentRuntime.artifact'), { label: resultLabel })}</span>}
    </div>
  );
}
