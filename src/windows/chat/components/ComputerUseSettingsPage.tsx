import { useEffect, useState } from 'react';
import { getActiveCharacterInfo } from '../../../shared/activeCharacter';
import {
  getComputerUseBackendStatus, openComputerUse,
  type ComputerUseBackendStatus, type ComputerUseControl,
} from '../../../shared/api/computer-use';
import { useComputerUse } from '../../../shared/computer-use/useComputerUse';
import { useI18n } from '../../../shared/i18n';

const reasons = {
  scope_changed: 'computerUse.reason.scope_changed',
  desktop_locked: 'computerUse.reason.desktop_locked',
  expired: 'computerUse.reason.expired',
  backend_offline: 'computerUse.reason.backend_offline',
  emergency_stop: 'computerUse.reason.emergency_stop',
  escape_cancel: 'computerUse.reason.escape_cancel',
  user_stopped: 'computerUse.reason.user_stopped',
  authorization_ended: 'computerUse.reason.authorization_ended',
  backend_denied: 'computerUse.reason.backend_denied',
} as const;

const fieldStyle = {
  padding: '6px 8px', border: '1px solid var(--paper-edge)', borderRadius: 6,
  background: 'var(--paper-2)', color: 'var(--ink)', font: 'inherit',
};

export function ComputerUseSettingsPage() {
  const { t } = useI18n();
  const { status, control, setStatus } = useComputerUse();
  const [backend, setBackend] = useState<ComputerUseBackendStatus | null>(null);
  const [allowCloud, setAllowCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = status != null && status.state !== 'closed';
  const cloudAvailable = backend?.transport_mode === 'cloud_proxy';
  useEffect(() => {
    if (!cloudAvailable) setAllowCloud(false);
  }, [cloudAvailable]);

  useEffect(() => {
    let mounted = true;
    const refresh = () => getComputerUseBackendStatus().then(
      value => { if (mounted) setBackend(value); },
      () => { if (mounted) setBackend(null); },
    );
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function grant() {
    const { id: charId, name } = getActiveCharacterInfo();
    if (!charId) { setError(true); return; }
    setBusy(true);
    try {
      setStatus(await openComputerUse(charId,
        backend?.transport_mode === undefined ? undefined : cloudAvailable && allowCloud,
        t('computerUse.overlay').replace('{name}', name || t('computerUse.agent'))));
      setAllowCloud(false);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function apply(action: ComputerUseControl) {
    try {
      await control(action);
      setError(false);
    } catch {
      setError(true);
    }
  }

  return (
    <section data-computer-use-settings style={{ display: 'grid', gap: 10, color: 'var(--ink)', fontSize: 13 }}>
      <div>
        <strong>{t('computerUse.title')}</strong>
        <div style={{ color: 'var(--ink-3)', marginTop: 4 }}>{t('computerUse.description')}</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" role="switch" checked={active}
          disabled={busy || (!active && (!backend?.enabled || !status?.supported))}
          onChange={event => void (event.target.checked ? grant() : apply('stop'))} />
        {t('computerUse.allow')}
      </label>
      {status?.supported === false ? <span>{t('computerUse.windowsOnly')}</span> : !active ? (
        backend?.enabled && status?.supported ? <>
          {cloudAvailable && <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={allowCloud} disabled={busy}
              onChange={event => setAllowCloud(event.target.checked)} />
            <span>{t('computerUse.cloudConsent')}</span>
          </label>}
        </> : <span>{t(backend?.enabled === false ? 'computerUse.disabled' : 'computerUse.unavailable')}</span>
      ) : <>
        <div role="status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{t(`computerUse.state.${status.state}`)}</span>
          {status.task_id && <span>{t('computerUse.step')} {status.steps}</span>}
        </div>
        {cloudAvailable && <small>{t(!status.cloud_vision ? 'computerUse.cloudDenied'
          : status.state === 'paused' ? 'computerUse.cloudPaused' : 'computerUse.cloudAllowed')}</small>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={fieldStyle} onClick={() => void apply(status.state === 'paused' ? 'resume' : 'pause')}>
            {t(status.state === 'paused' ? 'computerUse.resume' : 'computerUse.pause')}
          </button>
        </div>
      </>}
      <small style={{ color: 'var(--ink-3)' }}>{t('computerUse.shortcut')}</small>
      {status?.state === 'closed' && status.reason && <small role="status">{t(reasons[status.reason as keyof typeof reasons] ?? 'computerUse.reason.other')}</small>}
      {error && <small role="alert" style={{ color: 'var(--danger)' }}>{t('computerUse.error')}</small>}
    </section>
  );
}
