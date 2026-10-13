import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from '../../../shared/i18n';

export function WindowPinButton() {
  const { t } = useI18n();
  const [pinned, setPinned] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    getCurrentWindow().isAlwaysOnTop().then(value => {
      if (!disposed) { setPinned(value); setReady(true); }
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; };
  }, []);

  const toggle = async () => {
    if (!ready || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const current = getCurrentWindow();
      const next = !(await current.isAlwaysOnTop());
      await current.setAlwaysOnTop(next);
      setPinned(await current.isAlwaysOnTop());
    } catch { setFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const label = t(failed ? 'window.pin.failed' : !isTauri() ? 'window.pin.desktopOnly' : pinned ? 'window.pin.disable' : 'window.pin.enable');
  return <button type="button" title={label} aria-label={label} aria-pressed={pinned}
    disabled={!ready || busy} onClick={() => void toggle()} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '5px 8px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
      background: pinned ? 'var(--paper-3)' : 'var(--paper-2)',
      color: pinned ? 'var(--accent)' : 'var(--ink)', cursor: ready && !busy ? 'pointer' : 'default',
      opacity: ready ? 1 : 0.5,
    }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 3h8l-1 7 4 4v2H5v-2l4-4z" /><path d="M12 16v5" />
    </svg>
  </button>;
}
