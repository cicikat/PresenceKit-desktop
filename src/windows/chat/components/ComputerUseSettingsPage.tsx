import { useCallback, useEffect, useState } from 'react';
import { getActiveCharacterInfo } from '../../../shared/activeCharacter';
import {
  getComputerUseBackendStatus, getComputerUseWindows, openComputerUse,
  type ComputerUseBackendStatus, type ComputerUseControl, type WindowChoice,
} from '../../../shared/api/computer-use';
import { computerUseCountdown, useComputerUse } from '../../../shared/computer-use/useComputerUse';
import { useI18n } from '../../../shared/i18n';

const reasons = {
  scope_changed: 'computerUse.reason.scope_changed',
  desktop_locked: 'computerUse.reason.desktop_locked',
  expired: 'computerUse.reason.expired',
  backend_offline: 'computerUse.reason.backend_offline',
  emergency_stop: 'computerUse.reason.emergency_stop',
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
  const [choices, setChoices] = useState<WindowChoice[]>([]);
  const [windowIndex, setWindowIndex] = useState('');
  const [scope, setScope] = useState<'window' | 'desktop'>('window');
  const [minutes, setMinutes] = useState(3);
  const [allowCloud, setAllowCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = status != null && status.state !== 'closed';
  const cloudAvailable = backend?.transport_mode === 'cloud_proxy';
  const picked = windowIndex === '' ? undefined : choices[Number(windowIndex)];

  const refreshWindows = useCallback(async () => {
    try {
      setChoices(await getComputerUseWindows());
      setWindowIndex('');
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (status?.supported && backend?.enabled) void refreshWindows();
  }, [status?.supported, backend?.enabled, refreshWindows]);

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
    if (scope === 'window' && !picked) return;
    const charId = getActiveCharacterInfo().id;
    if (!charId) { setError(true); return; }
    setBusy(true);
    try {
      setStatus(await openComputerUse(scope === 'desktop' ? { kind: 'desktop' }
        : { kind: 'window', window: picked!.id }, minutes * 60, charId,
      backend?.transport_mode === undefined ? undefined : cloudAvailable && allowCloud));
      setScope('window');
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
      {status?.supported === false ? <span>{t('computerUse.windowsOnly')}</span> : !active ? (
        backend?.enabled && status?.supported ? <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select aria-label={t('computerUse.scope')} value={scope} style={fieldStyle}
              onChange={event => setScope(event.target.value === 'desktop' ? 'desktop' : 'window')}>
              <option value="window">{t('computerUse.window')}</option>
              <option value="desktop">{t('computerUse.desktop')}</option>
            </select>
            <select aria-label={t('computerUse.duration')} value={minutes} style={fieldStyle}
              onChange={event => setMinutes(Number(event.target.value))}>
              {[1, 3, 5, 15].map(value => <option key={value} value={value}>{value} {t('computerUse.minutes')}</option>)}
            </select>
          </div>
          {scope === 'window' ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select aria-label={t('computerUse.selectWindow')} value={windowIndex} style={{ ...fieldStyle, maxWidth: '100%' }}
              onChange={event => setWindowIndex(event.target.value)}>
              <option value="">{t('computerUse.selectWindow')}</option>
              {choices.map((choice, index) => <option key={choice.id.handle} value={index}>{choice.title}</option>)}
            </select>
            <button type="button" style={fieldStyle} onClick={() => void refreshWindows()}>{t('computerUse.refresh')}</button>
          </div> : <span style={{ color: 'var(--ink-3)' }}>{t('computerUse.desktopHint')}</span>}
          {cloudAvailable && <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={allowCloud} disabled={busy}
              onChange={event => setAllowCloud(event.target.checked)} />
            <span>{t('computerUse.cloudConsent')}</span>
          </label>}
          <div>
            <button type="button" style={fieldStyle} disabled={busy || (scope === 'window' && !picked)}
              onClick={() => void grant()}>{t(scope === 'window' ? 'computerUse.allowWindow' : 'computerUse.allowDesktop')}</button>
          </div>
        </> : <span>{t(backend?.enabled === false ? 'computerUse.disabled' : 'computerUse.unavailable')}</span>
      ) : <>
        <div role="status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{t(`computerUse.state.${status.state}`)}</span>
          <span>{t(status.scope?.kind === 'desktop' ? 'computerUse.desktop' : 'computerUse.window')}</span>
          <span className="mono">{computerUseCountdown(status.remaining_ms)}</span>
          {status.task_id && <span>{t('computerUse.step')} {status.steps}</span>}
        </div>
        {cloudAvailable && <small>{t(!status.cloud_vision ? 'computerUse.cloudDenied'
          : status.state === 'paused' ? 'computerUse.cloudPaused' : 'computerUse.cloudAllowed')}</small>}
        {status.state === 'ready' && <span style={{ color: 'var(--ink-3)' }}>{t('computerUse.focusHint')}</span>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={fieldStyle} onClick={() => void apply(status.state === 'paused' ? 'resume' : 'pause')}>
            {t(status.state === 'paused' ? 'computerUse.resume' : 'computerUse.pause')}
          </button>
          <button type="button" style={fieldStyle} onClick={() => void apply('stop')}>{t('computerUse.stop')}</button>
        </div>
      </>}
      <small style={{ color: 'var(--ink-3)' }}>{t('computerUse.shortcut')}</small>
      {status?.state === 'closed' && status.reason && <small role="status">{t(reasons[status.reason as keyof typeof reasons] ?? 'computerUse.reason.other')}</small>}
      {error && <small role="alert" style={{ color: 'var(--danger)' }}>{t('computerUse.error')}</small>}
    </section>
  );
}
