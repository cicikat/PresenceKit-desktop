import { useEffect, useState, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useI18n } from '../i18n';
import { WindowPinButton } from './WindowPinButton';
import './MainWindowFrame.css';

export function MainWindowFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);
  const [failed, setFailed] = useState(false);
  const native = isTauri();
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const current = getCurrentWindow();
    const refresh = () => current.isMaximized().then(value => {
      if (!disposed) setMaximized(value);
    }).catch(() => { if (!disposed) setFailed(true); });
    void refresh();
    void current.onResized(() => void refresh()).then(stop => {
      if (disposed) stop(); else unlisten = stop;
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => { disposed = true; unlisten?.(); };
  }, [native]);

  const run = async (action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging') => {
    if (!native) return;
    try {
      setFailed(false);
      const current = getCurrentWindow();
      await current[action]();
      if (action === 'toggleMaximize') setMaximized(await current.isMaximized());
    } catch { setFailed(true); }
  };
  const maximizeLabel = t(maximized ? 'window.restore' : 'window.maximize');
  return <div className="main-window-frame">
    <header className="main-titlebar">
      <div className="main-titlebar__drag" onMouseDown={event => {
        if (event.button === 0 && event.detail === 1) void run('startDragging');
      }} onDoubleClick={() => void run('toggleMaximize')}>
        <span>PresenceKit-desktop</span>
      </div>
      {failed && <span className="main-titlebar__error" role="status">{t('window.actionFailed')}</span>}
      <div className="main-titlebar__controls">
        <WindowPinButton />
        <button type="button" className="main-titlebar__button" disabled={!native}
          title={t('window.minimize')} aria-label={t('window.minimize')} onClick={() => void run('minimize')}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" className="main-titlebar__button" disabled={!native}
          title={maximizeLabel} aria-label={maximizeLabel} onClick={() => void run('toggleMaximize')}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            {maximized ? <><path d="M8 5h11v11M5 8h11v11H5z" /></> : <path d="M5 5h14v14H5z" />}
          </svg>
        </button>
        <button type="button" className="main-titlebar__button main-titlebar__close" disabled={!native}
          title={t('window.close')} aria-label={t('window.close')} onClick={() => void run('close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </header>
    <div className="main-window-frame__content">{children}</div>
  </div>;
}
