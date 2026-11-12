import { useEffect, useState } from 'react';
import { controlAgentSession, getAgentSessionStatus, type AgentSessionStatus } from '../api/computer-use';
import { useI18n } from '../i18n';
import { useComputerUse } from './useComputerUse';

const working = new Set(['created', 'planning', 'acting', 'observing']);
const running = new Set([...working, 'waiting_user', 'paused', 'paused_by_owner', 'paused_budget', 'paused_device']);
const unavailableVision = new Set(['vision_node_offline', 'vision_provider_error', 'vision_not_configured',
  'visual_verification_unavailable', 'cloud_vision_not_authorized']);

export function AgentSessionIndicator({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { status: local, control } = useComputerUse();
  const [session, setSession] = useState<AgentSessionStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [controlFailed, setControlFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    let timer: number;
    const refresh = async () => {
      try {
        const value = await getAgentSessionStatus();
        if (mounted) setSession(value.status === 'unavailable' ? null : value);
      } catch {
        if (mounted) setSession(null);
      } finally {
        if (mounted) timer = window.setTimeout(refresh, 2000);
      }
    };
    void refresh();
    return () => { mounted = false; window.clearTimeout(timer); };
  }, []);

  const active = local != null && local.state !== 'closed';
  const localTask = active && Boolean(local.task_id);
  const liveSession = session != null && running.has(session.status);
  const showTerminal = session?.updated_at != null
    && (!compact || Date.now() - session.updated_at * 1000 < 30_000);
  const phase = liveSession || (!localTask && showTerminal) ? session?.status : undefined;
  if (!phase && !localTask) return null;
  const phaseLabel = phase && phase !== 'unavailable'
    ? t(phase === 'created' ? 'computerUse.agent.planning' : `computerUse.agent.${phase}`)
    : t(local?.state === 'paused' ? 'computerUse.agent.paused' : 'computerUse.agent.acting');
  const action = phase === 'acting' && session?.current_action;
  const summary = action === 'observe' ? t('computerUse.agent.inspecting')
    : action === 'type_text' ? t('computerUse.agent.typing') : phaseLabel;
  const error = session?.last_error_code ?? '';
  const reason = error === 'session_failure_budget' ? t('computerUse.agent.failureBudget')
    : error === 'session_execution_budget' || error === 'session_time_budget' ? t('computerUse.agent.executionBudget')
    : error === 'vision_timeout' ? t('computerUse.agent.visionTimeout')
    : error === 'vision_invalid_response' ? t('computerUse.agent.visionInvalid')
    : unavailableVision.has(error) ? t('computerUse.agent.visionUnavailable') : '';
  const changeSession = async (action: 'pause' | 'resume') => {
    if (!session?.session_id) return;
    setPending(true);
    setControlFailed(false);
    try {
      const value = await controlAgentSession(session.session_id, action);
      setSession(value);
      setControlFailed(action === 'resume' ? value.can_resume === true : value.status !== 'paused_by_owner');
    } catch {
      setControlFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <section aria-label={t('computerUse.agent')} data-agent-session style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', fontSize: compact ? 11 : 12,
      ...(compact ? { position: 'absolute', right: 12, top: 12, zIndex: 2, borderRadius: 8,
        maxWidth: 'calc(100% - 24px)', flexWrap: 'wrap',
        color: 'rgba(255,255,255,.95)', background: 'rgba(18,29,54,.80)' }
        : { zIndex: 1, color: 'var(--ink)', background: 'var(--paper-2)' }),
    }}>
      <strong>{t('computerUse.agent')}</strong>
      <span role="status">{summary}{reason ? ` · ${reason}` : ''}
        {phase === 'waiting_user' && session?.question ? ` · ${session.question}` : ''}
        {controlFailed ? ` · ${t('computerUse.agent.controlFailed')}` : ''}
      </span>
      {session?.can_resume && (
        <button type="button" disabled={pending || !active || local?.state === 'paused'}
          onClick={() => void changeSession('resume')}>{t('computerUse.agent.continue')}</button>
      )}
      {!compact && active && session?.session_id && phase && working.has(phase) && (
        <button type="button" disabled={pending}
          onClick={() => void changeSession('pause')}>{t('computerUse.pause')}</button>
      )}
      {active && (localTask || liveSession) && (
        <button type="button" onClick={() => void control('stop').catch(() => {})} style={{
          border: '1px solid currentColor', borderRadius: 5, padding: '2px 6px', color: 'inherit',
          background: 'transparent', cursor: 'pointer', font: 'inherit',
        }}>{t('computerUse.stop')}</button>
      )}
    </section>
  );
}
