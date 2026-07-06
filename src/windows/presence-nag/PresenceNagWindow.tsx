import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { avatarStore } from '../../shared/avatars/store';
import type { PresenceNagPayload } from '../../shared/presenceNag';
import { getActiveCharacterInfo } from '../../shared/activeCharacter';
import './PresenceNagWindow.css';

// The payload's `avatar` field is a raw char_id (see actions.rs::presence_nag), not a
// display name. Resolve it against the cross-window active-character cache (cc-tasks/15
// §G); if it doesn't match anything we know about, fall back to the generic 'TA'.
function characterName(avatar: string): string {
  const value = avatar.trim();
  const info = getActiveCharacterInfo();
  if (value && value === info.id && info.name) return info.name;
  return value || info.name || 'TA';
}

export function PresenceNagWindow() {
  const [payload, setPayload] = useState<PresenceNagPayload>({
    text: '',
    avatar: '',
  });
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);

  const closeAll = useCallback(() => {
    void invoke('presence_nag_close_all');
  }, []);

  useEffect(() => {
    avatarStore.init()
      .then(() => setAvatarDataUrl(avatarStore.get().her.dataUrl))
      .catch(error => console.warn('[presence_nag] 头像载入失败:', error));
    return avatarStore.subscribe(config => setAvatarDataUrl(config.her.dataUrl));
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<PresenceNagPayload>('presence-nag', event => setPayload(event.payload))
      .then(stop => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(error => console.warn('[presence_nag] 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAll]);

  return (
    <main className="presence-nag">
      <section className="presence-nag__dialog" role="dialog" aria-modal="true" aria-labelledby="presence-nag-title">
        <header className="presence-nag__titlebar">
          <div className="presence-nag__signal" aria-hidden="true">!</div>
          <div>
            <div id="presence-nag-title" className="presence-nag__title">陪伴连接出现异常</div>
            <div className="presence-nag__subtitle">EMERALD · PRESENCE NOTICE</div>
          </div>
          <button className="presence-nag__close" onClick={closeAll} aria-label="全部关闭">×</button>
        </header>

        <div className="presence-nag__body">
          <div className="presence-nag__avatar" aria-hidden={!avatarDataUrl}>
            {avatarDataUrl
              ? <img src={avatarDataUrl} alt="" />
              : <span>{characterName(payload.avatar).charAt(0) || '?'}</span>}
          </div>
          <div className="presence-nag__content">
            <div className="presence-nag__name">{characterName(payload.avatar)}</div>
            <p>{payload.text}</p>
            <div className="presence-nag__code">ERROR: ATTENTION_NOT_FOUND</div>
          </div>
        </div>

        <footer className="presence-nag__actions">
          <button className="presence-nag__button presence-nag__button--ghost" onClick={closeAll}>别理我了</button>
          <button className="presence-nag__button presence-nag__button--primary" onClick={closeAll}>确定，我看到你了</button>
          <button className="presence-nag__all-close" onClick={closeAll}>全部关闭 · ESC</button>
        </footer>
      </section>
    </main>
  );
}
