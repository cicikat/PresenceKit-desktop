import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { listenPetSnapshots, listenPetTurn } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from '../../shared/pet/types';
import { sendChat } from '../../shared/api/backend';
import { useVoiceInput } from '../../shared/voice/useVoiceInput';
import { PetStage } from './components/PetStage';
import { usePetMouse } from './usePetMouse';
import { usePetRoam } from './usePetRoam';
import type { StickerPayload } from '../../shared/api/types';

export function PetWindow() {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(DEFAULT_PET_SNAPSHOT);
  const [turnBubble, setTurnBubble] = useState<{ id: string; text: string; sticker?: StickerPayload } | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const { pinned, reaction, startDrag, draggingRef, movingRef } = usePetMouse({ shy: snapshot.mood === '惊讶' });
  usePetRoam({ draggingRef, movingRef });

  const voice = useVoiceInput();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // Alt+1 global hotkey → toggle voice recording; on stop, auto-send transcribed text
  useEffect(() => {
    invoke('start_voice_hotkey_listener').catch(console.warn);
    let unlisten: (() => void) | undefined;
    listen<void>('voice-hotkey', async () => {
      const v = voiceRef.current;
      if (v.isRecording) {
        const text = await v.stop();
        if (text) sendChat(text).catch(console.warn);
      } else {
        await v.start();
      }
    }).then(fn => { unlisten = fn; }).catch(console.warn);
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetSnapshots(next => {
      if (!disposed) setSnapshot(next);
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] snapshot 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Pet main channel (cc-tasks/14 §D): full-text turns forwarded by ChatWindow, not a summary —
  // first cut only renders the canonical `channel_message`; streaming reveal can reuse
  // windows/room/turnIngest.ts later if wanted.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenPetTurn(turn => {
      if (disposed || turn.kind !== 'channel_message') return;
      setTurnBubble({ id: turn.msg_id, text: turn.content, sticker: turn.sticker });
    }).then(fn => {
      if (disposed) fn();
      else unlisten = fn;
    }).catch(error => console.warn('[pet] turn 监听失败:', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!turnBubble) return;
    const ms = Math.max(6000, turnBubble.text.length * 80, turnBubble.sticker ? 8000 : 0);
    const timer = window.setTimeout(() => setTurnBubble(null), ms);
    return () => window.clearTimeout(timer);
  }, [turnBubble]);

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setChatInput('');
    setSending(true);
    try {
      await sendChat(trimmed);
    } catch (error) {
      console.warn('[pet] sendChat 失败:', error);
    } finally {
      setSending(false);
    }
  }, [sending]);

  const handleInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend(chatInput);
    }
  }, [chatInput, handleSend]);

  return (
    <>
      <style>{`
        html, body { background: transparent !important; }
        body::before { display: none !important; }
      `}</style>
      <main
        onPointerDown={event => { void startDrag(event); }}
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: pinned ? 'grabbing' : 'grab',
          fontFamily: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
        }}
      >
        <PetStage snapshot={snapshot} reaction={reaction} volume={voice.isRecording ? voice.volume : 0} />

        {(voice.isRecording || pinned) && (
          <section style={{
            position: 'absolute',
            right: 14,
            top: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            color: 'rgba(255, 255, 255, 0.76)',
            fontSize: 10,
            letterSpacing: 1.3,
            textShadow: '0 1px 8px rgba(20, 12, 35, 0.8)',
          }}>
            {voice.isRecording && (
              <span className="mono" style={{ color: 'rgba(255, 120, 120, 0.9)', animation: 'petActivityIn 300ms ease-out' }}>
                {voice.transcribing ? 'STT…' : '● REC'}
              </span>
            )}
            {pinned && <span className="mono" style={{ opacity: 0.72 }}>PINNED</span>}
          </section>
        )}

        {turnBubble && (
          <section
            onPointerDown={event => event.stopPropagation()}
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 56,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(18, 12, 32, 0.82)',
              border: '1px solid rgba(224, 210, 255, 0.22)',
              boxShadow: '0 10px 26px rgba(12, 8, 24, 0.28)',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 12,
              lineHeight: 1.65,
              cursor: 'default',
            }}
          >
            {turnBubble.sticker && (
              <img
                src={turnBubble.sticker.data_url}
                alt={turnBubble.sticker.emotion}
                title={turnBubble.sticker.emotion}
                style={{ display: 'block', maxWidth: '100%', maxHeight: 220, margin: turnBubble.text ? '0 0 8px' : '0 auto', borderRadius: 8, objectFit: 'contain' }}
              />
            )}
            {turnBubble.text}
          </section>
        )}

        <section
          onPointerDown={event => event.stopPropagation()}
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 10,
            display: 'flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 10,
            background: inputFocused ? 'rgba(18, 12, 32, 0.82)' : 'rgba(18, 12, 32, 0.30)',
            border: '1px solid rgba(224, 210, 255, 0.18)',
            transition: 'background 0.15s ease-out',
          }}
        >
          <input
            type="text"
            value={chatInput}
            onChange={event => setChatInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            disabled={sending}
            placeholder="跟他说点什么…"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255, 255, 255, 0.92)',
              fontSize: 12,
              fontFamily: 'inherit',
              opacity: sending ? 0.5 : 1,
            }}
          />
        </section>
      </main>
      <style>{`
        @keyframes petActivityIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
