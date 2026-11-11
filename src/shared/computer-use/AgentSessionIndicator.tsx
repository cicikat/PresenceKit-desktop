import { useEffect, useState } from 'react';
import { getAgentSessionStatus, type AgentSessionStatus } from '../api/computer-use';
import { useI18n } from '../i18n';
import { useComputerUse } from './useComputerUse';

const running = new Set(['created', 'planning', 'acting', 'observing', 'waiting_user', 'paused']);

export function AgentSessionIndicator({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { status: local, control } = useComputerUse();
  const [session, setSession] = useState<AgentSessionStatus | null>(null);
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
  const reason = session?.last_error_code === 'session_failure_budget' ? t('computerUse.agent.failureBudget')
    : session?.last_error_code === 'session_execution_budget' || session?.last_error_code === 'session_time_budget'
      ? t('computerUse.agent.executionBudget') : '';
  return (
    <section aria-label={t('computerUse.agent')} data-agent-session style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px', fontSize: compact ? 11 : 12,
      ...(compact ? { position: 'absolute', right: 12, top: 12, zIndex: 2, borderRadius: 8,
        color: 'rgba(255,255,255,.95)', background: 'rgba(18,29,54,.80)' }
        : { zIndex: 1, color: 'var(--ink)', background: 'var(--paper-2)' }),
    }}>
      <strong>{t('computerUse.agent')}</strong>
      <span role="status">{summary}{reason ? ` · ${reason}` : ''}</span>
      {active && (localTask || liveSession) && (
        <button type="button" onClick={() => void control('stop').catch(() => {})} style={{
          border: '1px solid currentColor', borderRadius: 5, padding: '2px 6px', color: 'inherit',
          background: 'transparent', cursor: 'pointer', font: 'inherit',
        }}>{t('computerUse.stop')}</button>
      )}
    </section>
  );
}
