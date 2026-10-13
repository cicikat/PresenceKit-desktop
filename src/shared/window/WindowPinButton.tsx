import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from '../i18n';

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
  return <button type="button" className="main-titlebar__button" title={label} aria-label={label} aria-pressed={pinned}
    disabled={!ready || busy} onClick={() => void toggle()}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="rotate(35 12 12)">
        <path d="M8 3h8l-1 7 3 4v2H6v-2l3-4z" fill={pinned ? 'currentColor' : 'none'} />
        <path d="M12 16v6" />
      </g>
    </svg>
  </button>;
}
