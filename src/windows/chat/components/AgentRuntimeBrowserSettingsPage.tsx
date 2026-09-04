import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../../shared/activeCharacter';
import { browserCapabilityState, cancelAgentRuntimeTask, confirmAgentRuntimeBrowserTask, createAgentRuntimeBrowserTask, loadAgentRuntimeTasks, loadBrowserCapability, normalizeAgentRuntimeTask, normalizeAgentRuntimeTaskSnapshot, pauseAgentRuntimeBrowserTask, runAgentRuntimeBrowserTask, type AgentRuntimeTask, type BrowserCapabilitySnapshot, type BrowserTaskRequest } from '../../../shared/api/agent-runtime';
import { usePollingBackoff } from '../../../shared/api/backoffPoll';
import { useI18n } from '../../../shared/i18n';

const STATUS_KEYS = ['queued', 'running', 'waiting_confirm', 'paused', 'succeeded', 'failed', 'canceled', 'expired', 'outcome_unknown', 'unknown'] as const;
const OPERATIONS = ['navigate', 'read_page', 'click', 'fill', 'select', 'login', 'pay', 'post', 'delete', 'send_email', 'change_password', 'upload', 'download'] as const;
const CONFIRM_OPERATIONS = new Set(['login', 'pay', 'post', 'delete', 'send_email', 'change_password', 'upload', 'download']);

function replace(template: string, values: Record<string, string | number>): string { return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template); }
function formatTime(value: string | number | null | undefined): string { if (value === null || value === undefined || value === '') return '—'; const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(); }
function newIdempotencyKey(): string { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function AgentRuntimeBrowserSettingsPage() {
  const { t } = useI18n();
  const [charId, setCharId] = useState(() => getActiveCharacterInfo().id);
  const [capability, setCapability] = useState<BrowserCapabilitySnapshot | null>(null);
  const [tasks, setTasks] = useState<AgentRuntimeTask[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ url: '', operation: 'read_page', idempotencyKey: '', selector: '', value: '', workspacePath: '' });
  const pendingRequests = useRef(new Map<string, BrowserTaskRequest>());

  useEffect(() => subscribeActiveCharacter(info => { setCharId(info.id); pendingRequests.current.clear(); }), []);
  const refresh = useCallback(async () => {
    if (!charId) { setCapability(null); setTasks([]); setInitialLoading(false); return; }
    try {
      const [capabilityResult, taskResult] = await Promise.all([loadBrowserCapability(), loadAgentRuntimeTasks({ charId, capability: 'browser.automation', limit: 20 })]);
      setCapability(capabilityResult); setTasks(normalizeAgentRuntimeTaskSnapshot(taskResult).tasks); setLoadError(null);
    } catch (error) { setLoadError(String(error)); throw error; } finally { setInitialLoading(false); }
  }, [charId]);
  const polling = usePollingBackoff(refresh, { baseIntervalMs: 30_000, maxBackoffMs: 120_000, enabled: Boolean(charId) });

  const submit = async () => {
    if (!charId || !form.url.trim()) { setActionError(t('settings.agentRuntime.form.missingUrl')); return; }
    const params: Record<string, unknown> = {};
    if (['click', 'fill', 'select'].includes(form.operation)) {
      if (!form.selector.trim()) { setActionError(t('settings.agentRuntime.form.missingSelector')); return; }
      params.selector = form.selector.trim();
    }
    if (['fill', 'select'].includes(form.operation)) {
      if (!form.value.trim()) { setActionError(t('settings.agentRuntime.form.missingValue')); return; }
      params.value = form.value.trim();
    }
    if (['upload', 'download'].includes(form.operation)) {
      if (!form.workspacePath.trim()) { setActionError(t('settings.agentRuntime.form.missingWorkspacePath')); return; }
      params.path = form.workspacePath.trim();
    }
    const request: BrowserTaskRequest = { charId, url: form.url.trim(), operation: form.operation, idempotencyKey: form.idempotencyKey.trim() || newIdempotencyKey(), params };
    setSubmitting(true); setActionError(null);
    try {
      const task = normalizeAgentRuntimeTask(await createAgentRuntimeBrowserTask(request));
      if (!task) throw new Error(t('settings.agentRuntime.error'));
      pendingRequests.current.set(task.task_id, request); setForm(current => ({ ...current, url: '', idempotencyKey: '', selector: '', value: '', workspacePath: '' }));
      if (task.status === 'queued' && !CONFIRM_OPERATIONS.has(request.operation)) await runAgentRuntimeBrowserTask(task.task_id, request);
      await refresh();
    } catch (error) { setActionError(String(error)); } finally { setSubmitting(false); }
  };

  const act = async (task: AgentRuntimeTask, action: 'confirm' | 'pause' | 'cancel') => {
    const request = pendingRequests.current.get(task.task_id);
    if (action === 'confirm' && !request) { setActionError(t('settings.agentRuntime.controlUnavailable')); return; }
    setActionError(null);
    try {
      if (action === 'confirm') { await confirmAgentRuntimeBrowserTask(task.task_id, charId); await runAgentRuntimeBrowserTask(task.task_id, { ...request, confirmed: true }); }
      else if (action === 'pause') await pauseAgentRuntimeBrowserTask(task.task_id, charId);
      else await cancelAgentRuntimeTask(task.task_id, charId);
      await refresh();
    } catch (error) { setActionError(String(error)); }
  };

  if (initialLoading && !capability) return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>{t('settings.agentRuntime.loading')}</div>;
  const state = capability ? browserCapabilityState(capability) : 'unavailable';
  const canSubmit = state === 'enabled' && Boolean(capability?.adapter_available);
  const errorText = actionError || loadError || (polling.error ? `${t('settings.agentRuntime.error')}：${polling.error.message}` : null);
  return <div style={{ display: 'grid', gap: 14 }} data-testid="agent-runtime-browser-settings">
    <div><div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{t('settings.agentRuntime.title')}</div><div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.5, marginTop: 3 }}>{t('settings.agentRuntime.description')}</div></div>
    {capability && <div style={{ border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'grid', gap: 5, background: 'var(--paper-2)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 13, color: 'var(--ink)' }}>{t('settings.agentRuntime.capability.label')}</span><strong style={{ color: state === 'enabled' ? 'var(--accent-3)' : 'var(--danger)', fontSize: 12 }}>{t(`settings.agentRuntime.capability.${state}` as any)}</strong></div><div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.capability.reason'), { reason: capability.reason_code || (capability.adapter_available ? '—' : 'adapter_unavailable') })}</div><div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.domains'), { count: capability.allowed_domain_count })} · {replace(t('settings.agentRuntime.worker'), { state: t(capability.worker_alive ? 'settings.agentRuntime.worker.ready' : 'settings.agentRuntime.worker.offline') })} · {t('settings.agentRuntime.credentials')}</div></div>}
    <div style={{ padding: '9px 11px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-sm)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.5 }}>{t('settings.agentRuntime.safetyHint')}</div>
    <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--paper-edge)', paddingTop: 12 }}><div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{t('settings.agentRuntime.form.title')}</div><input value={form.url} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} placeholder={t('settings.agentRuntime.form.urlPlaceholder')} aria-label={t('settings.agentRuntime.form.urlLabel')} style={{ padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' }} />{['click', 'fill', 'select'].includes(form.operation) && <input value={form.selector} onChange={event => setForm(current => ({ ...current, selector: event.target.value }))} placeholder={t('settings.agentRuntime.form.selectorPlaceholder')} aria-label={t('settings.agentRuntime.form.selectorLabel')} style={{ padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' }} />}{['fill', 'select'].includes(form.operation) && <input value={form.value} onChange={event => setForm(current => ({ ...current, value: event.target.value }))} placeholder={t('settings.agentRuntime.form.valuePlaceholder')} aria-label={t('settings.agentRuntime.form.valueLabel')} style={{ padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' }} />}{['upload', 'download'].includes(form.operation) && <input value={form.workspacePath} onChange={event => setForm(current => ({ ...current, workspacePath: event.target.value }))} placeholder={t('settings.agentRuntime.form.workspacePathPlaceholder')} aria-label={t('settings.agentRuntime.form.workspacePathLabel')} style={{ padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' }} />}<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><select value={form.operation} onChange={event => setForm(current => ({ ...current, operation: event.target.value }))} aria-label={t('settings.agentRuntime.form.operationLabel')} style={{ flex: 1, minWidth: 150, padding: '7px 9px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink)' }}>{OPERATIONS.map(operation => <option key={operation} value={operation}>{t(`settings.agentRuntime.operation.${operation}` as any)}</option>)}</select><button type="button" onClick={() => void submit()} disabled={submitting || !canSubmit || !charId} style={{ padding: '7px 11px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--accent-3)', color: 'white', cursor: 'pointer', opacity: submitting || !canSubmit || !charId ? 0.55 : 1 }}>{submitting ? t('settings.agentRuntime.form.submitting') : t('settings.agentRuntime.form.submit')}</button></div><div className="mono" style={{ color: 'var(--ink-3)', fontSize: 9.5 }}>{t('settings.agentRuntime.form.confirmHint')}</div></div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{tasks.length ? replace(t('settings.agentRuntime.taskCount'), { count: tasks.length }) : t('settings.agentRuntime.empty')}</span><button type="button" onClick={() => { void polling.retryNow(); }} disabled={polling.backoffSeconds !== null || !charId} style={{ padding: '6px 10px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink-2)', cursor: 'pointer' }}>{t('settings.agentRuntime.refresh')}</button></div>
    {errorText && <div className="mono" style={{ color: 'var(--danger)', fontSize: 10.5 }}>{errorText}</div>}{polling.backoffSeconds !== null && <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 10 }}>{replace(t('settings.agentRuntime.retryIn'), { seconds: polling.backoffSeconds })}</div>}
    {tasks.length > 0 && <div style={{ display: 'grid', gap: 8 }}>{tasks.map(task => <TaskRow key={task.task_id} task={task} t={t} onAction={act} canConfirm={pendingRequests.current.has(task.task_id)} />)}</div>}
  </div>;
}

function TaskRow({ task, t, onAction, canConfirm }: { task: AgentRuntimeTask; t: (key: any) => string; onAction: (task: AgentRuntimeTask, action: 'confirm' | 'pause' | 'cancel') => void; canConfirm: boolean }) {
  const statusKey = STATUS_KEYS.includes(task.status as typeof STATUS_KEYS[number]) ? task.status : 'unknown';
  const resultArtifact = task.artifacts?.find(item => item.label || item.id);
  const resultLabel = resultArtifact?.label || resultArtifact?.id;
  const canPause = statusKey === 'queued' || statusKey === 'running';
  const canCancel = canPause || statusKey === 'waiting_confirm' || statusKey === 'paused';
  const showHandoff = statusKey === 'paused' || statusKey === 'outcome_unknown';
  const hasControls = canCancel || showHandoff;
  return <div style={{ border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'grid', gap: 6 }} data-task-status={statusKey}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{task.task_id}</span><strong style={{ fontSize: 11.5, color: statusKey === 'failed' || statusKey === 'outcome_unknown' ? 'var(--danger)' : 'var(--ink-2)' }}>{t(`settings.agentRuntime.status.${statusKey}`)}</strong></div><div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: 'var(--ink-3)', fontSize: 9.5 }}><span>{replace(t('settings.agentRuntime.created'), { time: formatTime(task.created_at) })}</span><span>{replace(t('settings.agentRuntime.updated'), { time: formatTime(task.updated_at) })}</span><span>{replace(t('settings.agentRuntime.attempts'), { count: task.attempt_count ?? 0 })}</span>{task.error_code && <span>{replace(t('settings.agentRuntime.errorCode'), { code: task.error_code })}</span>}</div><div className="mono" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: 9.5 }}><span>{replace(t('settings.agentRuntime.queued'), { time: formatTime(task.queued_at) })}</span><span>{replace(t('settings.agentRuntime.started'), { time: formatTime(task.started_at) })}</span><span>{replace(t('settings.agentRuntime.finished'), { time: formatTime(task.finished_at) })}</span></div>{statusKey === 'waiting_confirm' && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{t('settings.agentRuntime.confirmRequired')}</div>}{statusKey === 'outcome_unknown' && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{t('settings.agentRuntime.outcomeUnknownHint')}</div>}{hasControls && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{statusKey === 'waiting_confirm' && <button type="button" disabled={!canConfirm} onClick={() => onAction(task, 'confirm')} title={!canConfirm ? t('settings.agentRuntime.controlUnavailable') : undefined} style={{ fontSize: 10, padding: '4px 7px', opacity: canConfirm ? 1 : 0.55 }}>{t('settings.agentRuntime.control.confirm')}</button>}{canPause && <button type="button" onClick={() => onAction(task, 'pause')} style={{ fontSize: 10, padding: '4px 7px' }}>{t('settings.agentRuntime.control.pause')}</button>}{canCancel && <button type="button" onClick={() => onAction(task, 'cancel')} style={{ fontSize: 10, padding: '4px 7px' }}>{t('settings.agentRuntime.control.cancel')}</button>}{showHandoff && <button type="button" disabled title={t('settings.agentRuntime.controlUnavailable')} style={{ fontSize: 10, padding: '4px 7px', opacity: 0.55 }}>{t('settings.agentRuntime.control.handoff')}</button>}</div>}{task.truncated && <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 9.5 }}>{t('settings.agentRuntime.truncated')}</span>}{resultLabel && <span style={{ color: 'var(--ink-2)', fontSize: 11 }}>{replace(t('settings.agentRuntime.artifact'), { label: resultLabel })}</span>}</div>;
}
