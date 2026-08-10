import { useEffect, useState, type CSSProperties } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { clearDiaryDirectory, getDiarySyncStatus, setDiaryDirectory, syncDiary, type DiarySyncStatus } from '../../../shared/api/diary-sync';
import { useI18n } from '../../../shared/i18n';

const buttonStyle: CSSProperties = {
  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
  background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle, background: 'var(--accent-3)', color: 'var(--paper)', border: '1px solid transparent',
};

export function DiarySyncSettingsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<DiarySyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function refresh() {
    try {
      setStatus(await getDiarySyncStatus());
      setError(false);
    } catch {
      setMessage(t('settings.diarySync.loadFailed'));
      setError(true);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function chooseDirectory() {
    const selected = await open({ directory: true, multiple: false, title: t('settings.diarySync.choose') });
    if (typeof selected !== 'string' || !selected) return;
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await setDiaryDirectory(selected));
      setMessage(t('settings.diarySync.saved'));
      setError(false);
    } catch {
      setMessage(t('settings.diarySync.saveFailed'));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function runSync() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncDiary();
      setStatus(result);
      setMessage(result.status === 'no_changes' ? t('settings.diarySync.noChanges') : t('settings.diarySync.synced'));
      setError(result.status === 'conflict' || result.status === 'stale');
    } catch {
      setMessage(t('settings.diarySync.syncFailed'));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function clearDirectory() {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await clearDiaryDirectory());
      setMessage(t('settings.diarySync.cleared'));
      setError(false);
    } catch {
      setMessage(t('settings.diarySync.saveFailed'));
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{t('settings.diarySync.title')}</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
          {t('settings.diarySync.description')}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {status?.configured ? t('settings.diarySync.configured') : t('settings.diarySync.notConfigured')}
        {status && ` · ${t('settings.diarySync.tracked').replace('{count}', String(status.trackedEntries))}`}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={primaryButtonStyle} disabled={busy} onClick={() => void chooseDirectory()}>{t('settings.diarySync.choose')}</button>
        <button style={buttonStyle} disabled={busy || !status?.configured} onClick={() => void runSync()}>{busy ? t('settings.diarySync.syncing') : t('settings.diarySync.syncNow')}</button>
        <button style={buttonStyle} disabled={busy || !status?.configured} onClick={() => void clearDirectory()}>{t('settings.diarySync.clear')}</button>
        <button style={buttonStyle} disabled={busy} onClick={() => void refresh()}>{t('common.refresh')}</button>
      </div>
      {message && <div className="mono" style={{ fontSize: 10.5, color: error ? 'var(--danger)' : 'var(--ink-2)' }}>{message}</div>}
    </div>
  );
}
