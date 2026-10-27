import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { listenPetSnapshots, listenPetTurn } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT, type PetSnapshot } from '../../shared/pet/types';
import { sendChat } from '../../shared/api/backend';
import { getDesktopTtsEnabled, getTtsAutoPlay, type TtsAutoPlaySettings } from '../../shared/api/runtimeSettings';
import { useVoiceInput } from '../../shared/voice/useVoiceInput';
import { VoiceMessageBar } from '../chat/components/VoiceMessageBar';
import { normalizeChatDisplayText } from '../chat/chatDisplay';
import { renderInlineStyled } from '../chat/inlineStyle';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { PetTextPresentation } from '../../shared/character/useCharacterBehavior';
import { usePetBubbleLayout } from './usePetBubbleLayout';
import { PetStage } from './components/PetStage';
import { usePetMouse } from './usePetMouse';
import { usePetRoam } from './usePetRoam';
import { splitPetDialogue, petDialogueDuration, type PetDialogue } from './petDialogue';

export function PetWindow() {
  const [snapshot, setSnapshot] = useState<PetSnapshot>(DEFAULT_PET_SNAPSHOT);
  const [dialogue, setDialogue] = useState<PetDialogue[]>([]);
  const turnBubble = dialogue[0] ?? null;
  const bubbleLayout = usePetBubbleLayout(Boolean(turnBubble));
  const [audioEndedId, setAudioEndedId] = useState<string | null>(null);
  const textPresentation = useMemo(() => turnBubble?.text.trim() && audioEndedId !== turnBubble.id
    ? { id: turnBubble.id, until: Date.now() + petDialogueDuration(turnBubble) } : null, [turnBubble, audioEndedId]);
  const seenTurns = useRef(new Set<string>());
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [audioPlayingId, setAudioPlayingId] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsAutoPlay, setTtsAutoPlay] = useState<TtsAutoPlaySettings>({ chat: false, dream: false, video_call: false, desktop_pet: false, mobile: false });
  const ttsEnabledRef = useRef(ttsEnabled);
  const ttsAutoPlayRef = useRef(ttsAutoPlay);
  const stageRef = useRef<HTMLDivElement>(null);
  const { pinned, reaction, startDrag, draggingRef, movingRef } = usePetMouse({ shy: snapshot.mood === '惊讶', stageRef });
  usePetRoam({ draggingRef, movingRef });

  const voice = useVoiceInput();
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    let mounted = true;
    let unlistenAutoPlay: (() => void) | undefined;
    let unlistenEnabled: (() => void) | undefined;
    Promise.all([getDesktopTtsEnabled(), getTtsAutoPlay()]).then(([enabled, settings]) => {
      if (!mounted) return;
      ttsEnabledRef.current = enabled;
      ttsAutoPlayRef.current = settings;
      setTtsEnabled(enabled);
      setTtsAutoPlay(settings);
    }).catch(error => console.warn('[pet] 读取语音设置失败:', error));
    listen<TtsAutoPlaySettings>('tts-auto-play-settings', event => {
      if (!mounted) return;
      ttsAutoPlayRef.current = event.payload;
      setTtsAutoPlay(event.payload);
    }).then(fn => { unlistenAutoPlay = fn; }).catch(console.warn);
    listen<{ enabled: boolean }>('desktop-tts-settings', event => {
      if (!mounted) return;
      ttsEnabledRef.current = event.payload.enabled;
      setTtsEnabled(event.payload.enabled);
    }).then(fn => { unlistenEnabled = fn; }).catch(console.warn);
    return () => {
      mounted = false;
      unlistenAutoPlay?.();
      unlistenEnabled?.();
    };
  }, []);
  useEffect(() => {
    let characterId = getActiveCharacterInfo().id;
    return subscribeActiveCharacter(info => {
      if (info.id === characterId) return;
      characterId = info.id;
      setDialogue([]);
      setAudioPlayingId(null);
      setAudioEndedId(null);
      seenTurns.current.clear();
    });
  }, []);

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
    return () => {
      unlisten?.();
      void invoke('stop_voice_hotkey_listener').catch(() => {});
    };
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
      if (seenTurns.current.has(turn.msg_id)) return;
      seenTurns.current.add(turn.msg_id);
      if (seenTurns.current.size > 200) seenTurns.current.delete(seenTurns.current.values().next().value!);
      const parts = splitPetDialogue({
        id: turn.msg_id,
        text: turn.content,
        sticker: turn.sticker,
        artifacts: turn.artifacts,
        autoPlayTts: ttsEnabledRef.current && ttsAutoPlayRef.current.desktop_pet,
      });
      setDialogue(previous => [...previous, ...parts]);
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
    if (audioPlayingId === turnBubble.id) return;
    const ms = petDialogueDuration(turnBubble);
    const timer = window.setTimeout(() => setDialogue(previous => previous.slice(1)), ms);
    return () => window.clearTimeout(timer);
  }, [turnBubble, audioPlayingId]);

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
        onPointerDownCapture={event => {
          if (event.shiftKey || (event.target as HTMLElement).closest('section, input, button, select, textarea')) return;
          void startDrag(event);
        }}
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
        <div ref={stageRef} data-pet-stage style={{ position: 'absolute', left: bubbleLayout.petLeft, top: 0, width: bubbleLayout.stageWidth, height: '100%' }}>
          <PetTextPresentation.Provider value={textPresentation}>
            <PetStage snapshot={snapshot} reaction={reaction} volume={voice.isRecording ? voice.volume : 0} />
          </PetTextPresentation.Provider>
        </div>

        {(voice.isRecording || pinned) && (
          <section style={{
            position: 'absolute',
            left: bubbleLayout.petLeft + 14,
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
            key={turnBubble.id}
            onPointerDown={event => event.stopPropagation()}
            style={{
              position: 'absolute',
              left: bubbleLayout.side === 'right' ? bubbleLayout.petLeft + bubbleLayout.stageWidth + 12 : undefined,
              right: bubbleLayout.side === 'left' ? bubbleLayout.stageWidth + 12 : undefined,
              width: 'max-content',
              maxWidth: `min(${Math.max(0, bubbleLayout.wing - 24)}px, 21em)`,
              boxSizing: 'border-box',
              top: 32,
              maxHeight: 'calc(100% - 64px)',
              display: 'flex',
              flexDirection: 'column',
              visibility: bubbleLayout.wing > 32 ? 'visible' : 'hidden',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(18, 12, 32, 0.48)',
              border: '1px solid rgba(224, 210, 255, 0.18)',
              boxShadow: '0 4px 14px rgba(12, 8, 24, 0.12)',
              color: 'rgba(255, 255, 255, 0.96)',
              textShadow: '0 1px 3px rgba(12, 8, 24, 0.7)',
              animation: 'petBubbleIn 160ms ease-out',
              fontSize: 12,
              lineHeight: 1.65,
              cursor: 'default',
            }}
            data-pet-bubble={bubbleLayout.side}
          >
            <span aria-hidden="true" style={{
              position: 'absolute', top: 14, width: 16, height: 16,
              [bubbleLayout.side === 'right' ? 'left' : 'right']: -15,
              background: 'rgba(18, 12, 32, 0.48)',
              clipPath: bubbleLayout.side === 'right' ? 'polygon(100% 0, 0 70%, 100% 100%)' : 'polygon(0 0, 100% 70%, 0 100%)',
            }} />
            <div style={{ overflowY: 'auto', overflowWrap: 'anywhere', textWrap: 'pretty', lineBreak: 'strict', minHeight: 0, userSelect: 'text' }}>
            {turnBubble.sticker && (
              <img
                src={turnBubble.sticker.data_url}
                alt={turnBubble.sticker.emotion}
                title={turnBubble.sticker.emotion}
                style={{ display: 'block', maxWidth: '100%', maxHeight: 220, margin: turnBubble.text ? '0 0 8px' : '0 auto', borderRadius: 8, objectFit: 'contain' }}
              />
            )}
            {renderInlineStyled(normalizeChatDisplayText(turnBubble.text))}
            {ttsEnabled && turnBubble.text && (
              <div style={{ marginTop: 9 }}>
                <VoiceMessageBar key={turnBubble.id} text={turnBubble.text} messageId={turnBubble.msgId} autoPlay={Boolean(turnBubble.autoPlayTts)}
                  onPlaybackStart={() => { setAudioPlayingId(turnBubble.id); setAudioEndedId(null); }}
                  onPlaybackEnd={() => { setAudioPlayingId(current => current === turnBubble.id ? null : current); setAudioEndedId(turnBubble.id); }} />
              </div>
            )}
            </div>
          </section>
        )}

        <section
          onPointerDown={event => event.stopPropagation()}
          style={{
            position: 'absolute',
            left: bubbleLayout.petLeft + 10,
            width: bubbleLayout.stageWidth - 20,
            boxSizing: 'border-box',
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
        @keyframes petBubbleIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes petActivityIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
