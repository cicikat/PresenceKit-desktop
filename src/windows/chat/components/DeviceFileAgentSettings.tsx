import { useEffect, useState } from 'react';
import { deviceFileAgent, type FileAgentStatus, type FileAgentMode } from '../../../shared/api/device-file-agent';
import { useI18n } from '../../../shared/i18n';
import { prefActionButtonStyle, prefSelectStyle } from './preferences/PrefAtoms';

export function DeviceFileAgentSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<FileAgentStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [write, setWrite] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void deviceFileAgent.status().then(value => {
        if (active) setStatus(value);
      }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setStatus(await deviceFileAgent.status());
    } catch (failure) {
      setError(t(String(failure) === 'revision_conflict' ? 'localFiles.conflict' : 'localFiles.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 10, color: 'var(--ink)', fontSize: 13 }}>
      <strong>{t('localFiles.title')}</strong>
      <p style={{ margin: 0, color: 'var(--ink-3)' }}>{t('localFiles.consent')}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select aria-label={t('localFiles.title')} style={prefSelectStyle}
          disabled={busy || !status} value={status?.state ?? 'disabled'}
          onChange={event => {
            const mode = event.target.value as FileAgentMode;
            void run(() => deviceFileAgent.mode(mode));
          }}>
          <option value="disabled">{t('localFiles.disabled')}</option>
          <option value="enabled">{t('localFiles.enabled')}</option>
          <option value="paused">{t('localFiles.paused')}</option>
        </select>
        {status?.state === 'enabled' && <span>{t(status.online ? 'localFiles.online' : 'localFiles.offline')}</span>}
      </div>
      <label>
        <input type="checkbox" role="switch" checked={status?.unrestricted ?? false} disabled={busy || !status}
          onChange={event => {
            const enabled = event.target.checked;
            void run(() => deviceFileAgent.unrestricted(enabled, false));
          }} />
        {t('localFiles.unrestricted')}
      </label>
      {status?.unrestricted && <label>
        <input type="checkbox" checked={status.unrestricted_write} disabled={busy}
          onChange={event => {
            const allowed = event.target.checked;
            void run(() => deviceFileAgent.unrestricted(true, allowed));
          }} />
        {t('localFiles.unrestrictedWrite')}
      </label>}
      <p style={{ margin: 0, color: 'var(--ink-3)' }}>{t('localFiles.unrestrictedHint')}</p>
      <label>
        <input type="checkbox" checked={write} disabled={busy} onChange={event => setWrite(event.target.checked)} />
        {t('localFiles.write')}
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={prefActionButtonStyle} disabled={busy || !status}
          onClick={() => void run(() => deviceFileAgent.pick(false, write))}>{t('localFiles.folder')}</button>
        <button style={prefActionButtonStyle} disabled={busy || !status}
          onClick={() => void run(() => deviceFileAgent.pick(true, write))}>{t('localFiles.file')}</button>
      </div>
      {status?.grants.map(grant => (
        <div key={grant.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span>{grant.alias}</span>
          <label>
            <input type="checkbox" checked={grant.write} disabled={busy}
              onChange={event => {
                const allowed = event.target.checked;
                void run(() => deviceFileAgent.grant(grant.id, allowed));
              }} />
            {t('localFiles.write')}
          </label>
          <button style={prefActionButtonStyle} disabled={busy}
            onClick={() => void run(() => deviceFileAgent.grant(grant.id, null))}>{t('localFiles.remove')}</button>
        </div>
      ))}
      {status?.action?.[1] && <span role="status">{status.action[1]}</span>}
      {Boolean(status?.recent.length) && (
        <>
          <strong>{t('localFiles.recent')}</strong>
          {status?.recent.map(row => (
            <details key={row.id}>
              <summary>{row.path} · {t(row.status === 'ok'
                ? row.synced ? 'localFiles.saved' : 'localFiles.savedPending'
                : row.status === 'outcome_unknown' ? 'localFiles.uncertain' : 'localFiles.error')}</summary>
              {row.status === 'ok' && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.diff}</pre>}
              {row.undoable && <button style={prefActionButtonStyle} disabled={busy}
                onClick={() => void run(() => deviceFileAgent.undo(row.id))}>{t('localFiles.undo')}</button>}
              {row.undoable && status.recent.find(item => item.task_id === row.task_id)?.id === row.id &&
                <button style={prefActionButtonStyle} disabled={busy}
                  onClick={() => void run(async () => {
                    const result = await deviceFileAgent.undoTask(row.task_id);
                    if (result.error) throw result.error;
                  })}>{t('localFiles.undoTask')}</button>}
            </details>
          ))}
          <div>
            <button style={prefActionButtonStyle} disabled={busy}
              onClick={() => void run(deviceFileAgent.clear)}>{t('localFiles.clear')}</button>
          </div>
        </>
      )}
      {error && <div role="alert">{error}</div>}
    </section>
  );
}
