import { useEffect, useRef, useState } from 'react';
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getActiveCharacterInfo } from '../../shared/activeCharacter';
import { getCharacterAvatar, respondVideoCallInvite } from '../../shared/api/backend';
import './IncomingCallWindow.css';

const params = new URLSearchParams(window.location.search);
const inviteId = params.get('invite') ?? '';
const charId = params.get('char') ?? '';
const parsedDeadline = Number(params.get('deadline'));
const deadline = Number.isFinite(parsedDeadline) ? parsedDeadline : 0;

async function closeInviteWindow(): Promise<void> {
  const current = getCurrentWindow();
  // A close request can be intercepted by another listener. Destroy is the final
  // local cleanup and does not wait for a backend response.
  await Promise.race([
    current.close().catch(() => undefined),
    new Promise<void>(resolve => window.setTimeout(resolve, 500)),
  ]);
  await current.destroy().catch(error => console.warn('[video-call] destroy invite window failed', error));
}

export function IncomingCallWindow() {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const settled = useRef(false);
  const inFlight = useRef(false);
  const active = getActiveCharacterInfo();
  const charName = active.id === charId ? (active.name || charId) : (charId || '角色');

  useEffect(() => {
    let live = true;
    if (charId) void getCharacterAvatar(charId)
      .then(value => { if (live) setAvatar(value); })
      .catch(() => { if (live) setAvatar(null); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0 && !settled.current) {
        settled.current = true;
        void closeInviteWindow();
      }
    }, 100);
    const unlisten = getCurrentWindow().onCloseRequested(() => {
      if (settled.current || inFlight.current) return;
      settled.current = true;
      if (inviteId && Date.now() < deadline) void respondVideoCallInvite(inviteId, 'declined').catch(console.warn);
    });
    return () => { window.clearInterval(timer); void unlisten.then(stop => stop()); };
  }, []);

  async function decide(status: 'accepted' | 'declined') {
    if (settled.current || inFlight.current || !inviteId || Date.now() >= deadline) return;
    inFlight.current = true;
    setBusy(true);
    if (status === 'declined') {
      settled.current = true;
      void respondVideoCallInvite(inviteId, status).catch(error => console.warn('[video-call] decline report failed', error));
      void closeInviteWindow();
      return;
    }
    try {
      await respondVideoCallInvite(inviteId, status);
      settled.current = true;
      if (status === 'accepted') {
        await emitTo('main', 'video-call-invite-accepted', { invite_id: inviteId, char_id: charId });
      }
      await closeInviteWindow();
    } catch (cause) {
      if (Date.now() >= deadline) {
        settled.current = true;
        await closeInviteWindow();
      } else {
        setError(`来电操作失败：${String(cause).slice(0, 80)}`);
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  return <main className="incoming-call" aria-label="视频来电">
    <div className="incoming-call__grain" aria-hidden="true" />
    <div className="incoming-call__topline"><span className="incoming-call__dot" /> 加密视频通话 <span>LIVE</span></div>
    <div className="incoming-call__center">
      <div className="incoming-call__rings" aria-hidden="true"><i /><i /><i /></div>
      <div className="incoming-call__avatar" aria-hidden="true">{avatar ? <img src={avatar} alt="" /> : charName.slice(0, 1)}</div>
      <div className="incoming-call__eyebrow">正在呼叫你</div>
      <h1>{charName}</h1>
      <p>想和你视频聊一会儿</p>
      <div className="incoming-call__timer" role="timer">{remaining} 秒后自动挂断</div>
    </div>
    <div className="incoming-call__actions">
      <button className="incoming-call__action incoming-call__action--decline" disabled={busy || remaining <= 0} onClick={() => void decide('declined')} aria-label="拒绝视频来电">
        <span className="incoming-call__button-icon">✕</span><span>拒绝</span>
      </button>
      <button className="incoming-call__action incoming-call__action--accept" disabled={busy || remaining <= 0} onClick={() => void decide('accepted')} aria-label="接通视频来电">
        <span className="incoming-call__button-icon">✓</span><span>接通</span>
      </button>
    </div>
    {error && <div className="incoming-call__error" role="alert">{error}</div>}
    <div className="incoming-call__footer">Emerald · 视频来电</div>
  </main>;
}
