import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../chat/components/UIKit';
import { listenPetSnapshots } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT } from '../../shared/pet/types';
import type { Mood } from '../../shared/state/store';
import { ThreeCallStage } from './ThreeCallStage';
import type { ThreeCallStageHandle } from './ThreeCallStage';
import { Live2DCallStage } from './Live2DCallStage';
import { useVnPresenter } from './useVnPresenter';
import { loadRoomSettings, subscribeRoomSettings } from '../../shared/room/roomSettings';
import type { RoomSettings } from '../../shared/room/roomSettings';
import { setupAvatarDirectiveListener } from './avatarDirective';
import { sendChat } from '../../shared/api/backend';
import { wsClient } from '../../shared/api/ws';
import { useVoiceInput } from '../../shared/voice/useVoiceInput';
import { VnBubble } from './VnBubble';
import { getActiveCharacterName, subscribeActiveCharacter } from '../../shared/activeCharacter';

// ── helpers ──────────────────────────────────────────────────────────────────

function useTick(): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return secs;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export function RoomWindow({ onClose }: { onClose: () => void }) {
  const [charName, setCharName] = useState(() => getActiveCharacterName());
  useEffect(() => subscribeActiveCharacter(() => setCharName(getActiveCharacterName())), []);
  const [mood, setMood] = useState<Mood>(DEFAULT_PET_SNAPSHOT.mood);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(loadRoomSettings);
  const elapsed = useTick();
  const renderMode = roomSettings.renderMode ?? 'model3d';

  const threeStageRef = useRef<ThreeCallStageHandle>(null);
  const [freeLook, setFreeLook] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const handleSceneStateChange = useCallback((fl: boolean, pm: boolean) => {
    setFreeLook(fl);
    setPlacementMode(pm);
  }, []);
  // ThreeCallStage unmounts when leaving 3D mode, so its state-change effect stops firing —
  // reset here immediately instead of leaving the bottom bar showing a stale active toggle.
  useEffect(() => {
    if (renderMode !== 'model3d') {
      setFreeLook(false);
      setPlacementMode(false);
    }
  }, [renderMode]);

  // Chat input
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // User echo bubble
  const [userBubble, setUserBubble] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const userBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voice = useVoiceInput();

  // Assistant bubble: buffer/revealed VN presenter (see turnIngest.ts / useVnPresenter.ts)
  const presenter = useVnPresenter({ onWatchdogTimeout: () => setSending(false) });

  // `sending` only tracks the user-facing input-disable window; the presenter owns turn/text
  // lifecycle entirely. stream_end normally clears it, onWatchdogTimeout above covers the case
  // where the WS dies mid-stream and stream_end never arrives.
  useEffect(() => {
    const unStart = wsClient.on('message_stream_start', () => setSending(true));
    const unEnd = wsClient.on('message_stream_end', () => setSending(false));
    return () => { unStart(); unEnd(); };
  }, []);

  // ── pet snapshot / settings ───────────────────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listenPetSnapshots(snap => {
      setMood(snap.mood);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => subscribeRoomSettings(setRoomSettings), []);
  useEffect(() => setupAvatarDirectiveListener(), []);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (userBubbleTimerRef.current) clearTimeout(userBubbleTimerRef.current);
  }, []);

  // ── send ──────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setChatInput('');
    setSending(true);

    // Show user bubble
    setUserBubble({ text: trimmed, visible: true });
    if (userBubbleTimerRef.current) clearTimeout(userBubbleTimerRef.current);
    userBubbleTimerRef.current = setTimeout(
      () => setUserBubble(prev => ({ ...prev, visible: false })),
      3000,
    );

    try {
      await sendChat(trimmed);
    } catch {
      setSending(false);
    }
  }, [sending]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(chatInput);
    }
  }, [chatInput, handleSend]);

  const handleMicClick = useCallback(async () => {
    if (voice.isRecording) {
      const text = await voice.stop();
      if (text) handleSend(text);
    } else {
      await voice.start();
    }
  }, [voice, handleSend]);

  // ── styles ────────────────────────────────────────────────────────────────

  const btnBase: React.CSSProperties = {
    width: 44, height: 44, borderRadius: '50%',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  };

  return (
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        background: 'oklch(0.08 0.02 240)',
        outline: '2px solid var(--accent, oklch(0.55 0.18 210))',
        boxShadow: '0 0 40px var(--dt-glow-1, oklch(0.55 0.18 210 / 0.25)), 0 0 80px var(--dt-glow-2, oklch(0.55 0.18 210 / 0.10))',
      }}
    >
      {/* top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        background: 'oklch(0.10 0.02 240 / 0.90)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid oklch(0.25 0.05 240 / 0.6)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'oklch(0.65 0.20 142)',
          boxShadow: '0 0 6px oklch(0.65 0.20 142)',
        }} />
        <span style={{
          color: 'oklch(0.88 0.04 240)', fontSize: 14, fontWeight: 500,
          flex: 1, fontFamily: 'var(--font-ui, inherit)',
        }}>
          {charName}
        </span>
        <span style={{
          color: 'oklch(0.60 0.03 240)', fontSize: 13,
          fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1,
        }}>
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Character stage container — 3D (Three.js) or Live2D, picked by roomSettings.renderMode */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {renderMode === 'live2d' ? (
          <Live2DCallStage mood={mood} talking={presenter.talking} />
        ) : (
          <ThreeCallStage
            ref={threeStageRef}
            mood={mood}
            talking={presenter.talking}
            settings={roomSettings}
            onSceneStateChange={handleSceneStateChange}
          />
        )}

        {/* Assistant VN bubble — bottom center */}
        {presenter.bubble && (
          <VnBubble
            name={charName}
            text={presenter.bubble.text}
            nameAlign="left"
            visible={presenter.bubble.visible}
            streaming={presenter.bubble.streaming}
            canAdvance={presenter.bubble.canAdvance}
            fadeMs={presenter.bubble.fadeMs}
            onClick={presenter.onBubbleClick}
            style={{
              position: 'absolute',
              bottom: 16, left: '50%', transform: 'translateX(-50%)',
              maxWidth: '78%', minWidth: 200, zIndex: 10,
            }}
          />
        )}

        {/* User echo bubble — bottom right */}
        {userBubble.text && (
          <VnBubble
            name="你"
            text={userBubble.text}
            nameAlign="right"
            visible={userBubble.visible}
            style={{
              position: 'absolute',
              bottom: 16, right: 12,
              maxWidth: '50%', minWidth: 80, zIndex: 9,
            }}
          />
        )}
      </div>

      {/* chat input bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: 'oklch(0.10 0.02 240 / 0.90)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid oklch(0.25 0.05 240 / 0.6)',
        flexShrink: 0,
      }}>
        {/* mic button */}
        <button
          title={voice.isRecording ? '停止录音' : '语音输入'}
          onClick={handleMicClick}
          style={{
            flexShrink: 0,
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: voice.isRecording ? 'oklch(0.50 0.22 25)' : 'oklch(0.18 0.03 240)',
            color: voice.isRecording ? '#fff' : 'oklch(0.60 0.05 240)',
            boxShadow: voice.isRecording ? '0 0 8px oklch(0.50 0.22 25 / 0.6)' : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >
          <Icon name="mic" size={16} />
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder="输入消息，Enter 发送…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={sending || voice.isRecording}
          style={{
            flex: 1, height: 36,
            background: 'oklch(0.15 0.02 240)',
            border: '1px solid oklch(0.28 0.05 240 / 0.7)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'oklch(0.90 0.03 240)',
            fontSize: 13, padding: '0 12px',
            fontFamily: 'var(--font-ui, inherit)',
            outline: 'none',
            opacity: (sending || voice.isRecording) ? 0.5 : 1,
          }}
        />

        <button
          title="发送"
          onClick={() => handleSend(chatInput)}
          disabled={!chatInput.trim() || sending}
          style={{
            flexShrink: 0,
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            cursor: (!chatInput.trim() || sending) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: (!chatInput.trim() || sending) ? 'oklch(0.18 0.03 240)' : 'oklch(0.42 0.18 210)',
            color: (!chatInput.trim() || sending) ? 'oklch(0.40 0.03 240)' : '#fff',
            transition: 'background 0.15s',
          }}
        >
          <Icon name="send" size={16} />
        </button>
      </div>

      {/* bottom controls */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
        padding: '16px 24px',
        background: 'oklch(0.10 0.02 240 / 0.90)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid oklch(0.25 0.05 240 / 0.6)',
        flexShrink: 0,
      }}>
        {/* camera — Phase 3 placeholder */}
        <button
          title="摄像头（Phase 3 启用）"
          disabled
          style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.50 0.03 240)', opacity: 0.5 }}
        >
          <Icon name="video" size={20} />
        </button>

        {/* placement mode / free look / save view — 3D-only; Live2D has no equivalent controls */}
        {renderMode === 'model3d' && (
          <>
            <button
              title={placementMode ? '退出摆放模式' : '摆放模式（点选物体拖动）'}
              onClick={() => threeStageRef.current?.togglePlacementMode()}
              style={{
                ...btnBase,
                background: placementMode ? 'oklch(0.40 0.14 60)' : 'oklch(0.22 0.03 240)',
                color: placementMode ? 'oklch(0.92 0.06 60)' : 'oklch(0.55 0.05 240)',
                outline: placementMode ? '2px solid oklch(0.62 0.18 60)' : 'none',
                fontSize: 18,
              }}
            >
              🛠
            </button>

            <button
              title={freeLook ? '退出自由视角' : '调整视角（自由视角）'}
              onClick={() => threeStageRef.current?.toggleFreeLook()}
              style={{
                ...btnBase,
                background: freeLook ? 'oklch(0.42 0.15 250)' : 'oklch(0.22 0.03 240)',
                color: freeLook ? 'oklch(0.92 0.04 240)' : 'oklch(0.55 0.05 240)',
                outline: freeLook ? '2px solid oklch(0.55 0.18 210)' : 'none',
              }}
            >
              <Icon name="move" size={20} />
            </button>

            {freeLook && (
              <button
                title="保存当前视角"
                onClick={() => threeStageRef.current?.saveCurrentView()}
                style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.72 0.12 142)' }}
              >
                <Icon name="bookmark" size={20} />
              </button>
            )}
          </>
        )}

        {/* hang up */}
        <button
          title="挂断"
          onClick={onClose}
          style={{ ...btnBase, width: 52, height: 52, background: 'oklch(0.52 0.22 25)', color: '#fff' }}
        >
          <Icon name="phone-off" size={22} />
        </button>
      </div>
    </div>
  );
}
