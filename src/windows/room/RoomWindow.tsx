import { useEffect, useRef, useState, useCallback } from 'react';
import { Icon } from '../chat/components/UIKit';
import { listenPetSnapshots } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT } from '../../shared/pet/types';
import { MOOD_TABLE, type Mood } from '../../shared/state/store';
import { useI18n } from '../../shared/i18n';
import './RoomWindow.css';
import { ThreeCallStage } from './ThreeCallStage';
import type { ThreeCallStageHandle } from './ThreeCallStage';
import { Live2DCallStage } from './Live2DCallStage';
import { Live2DEditorPanel } from './Live2DEditorPanel';
import { useVnPresenter } from './useVnPresenter';
import { loadRoomSettings, subscribeRoomSettings } from '../../shared/room/roomSettings';
import type { RoomSettings } from '../../shared/room/roomSettings';
import { setupAvatarDirectiveListener } from './avatarDirective';
import { sendChat } from '../../shared/api/backend';
import { wsClient } from '../../shared/api/ws';
import { useContinuousCallVoice } from './useContinuousCallVoice';
import { canAutoSend, joinTranscript } from './callVoiceUtils';
import { VnBubble } from './VnBubble';
import { getActiveCharacterInfo, getActiveCharacterName, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { isSingleRealityMessage } from '../../shared/api/realityMessageScope';
import { useVideoCallCamera } from './useVideoCallCamera';
import { getTtsAutoPlay } from '../../shared/api/runtimeSettings';
import { CallSpeechPresenter } from './CallSpeechPresenter';
import type { SceneCameraPreset } from './sceneCameraPresets';

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
  const { t } = useI18n();
  const [charName, setCharName] = useState(() => getActiveCharacterName());
  useEffect(() => subscribeActiveCharacter(() => setCharName(getActiveCharacterName())), []);
  const [mood, setMood] = useState<Mood>(DEFAULT_PET_SNAPSHOT.mood);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(loadRoomSettings);
  const elapsed = useTick();
  const renderMode = roomSettings.renderMode ?? 'model3d';

  const threeStageRef = useRef<ThreeCallStageHandle>(null);
  const [freeLook, setFreeLook] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  // `editMode` is the shell-level "editing the picture" state. In 3D it is placementMode (gizmos,
  // lights, props); in Live2D there is no placement, only color grade, so it is its own flag.
  const [live2dEdit, setLive2dEdit] = useState(false);
  const editMode = renderMode === 'live2d' ? live2dEdit : placementMode;
  const [cameraPresets, setCameraPresets] = useState<SceneCameraPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const handleCameraPresetsChange = useCallback((presets: SceneCameraPreset[]) => setCameraPresets(presets), []);
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
    if (renderMode !== 'live2d') setLive2dEdit(false);
  }, [renderMode]);

  // Chat input
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const speechDraftRef = useRef('');
  // 本条消息累积的所有分段回执（工单 A3）；发送时一并交给后端取最差置信度。
  const audioReceiptsRef = useRef<{ text: string; id: string }[]>([]);
  const [speechDraft, setSpeechDraft] = useState('');
  const [audioStatus, setAudioStatus] = useState<string | null>(null);
  const onTranscript = useCallback((text: string, audioPerceptionId?: string) => {
    speechDraftRef.current = joinTranscript(speechDraftRef.current, text).slice(-12_000);
    if (audioPerceptionId) audioReceiptsRef.current = [...audioReceiptsRef.current, { text, id: audioPerceptionId }].slice(-16);
    setSpeechDraft(speechDraftRef.current);
  }, []);

  // User echo bubble
  const [userBubble, setUserBubble] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const userBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voice = useContinuousCallVoice(onTranscript);
  const camera = useVideoCallCamera();
  const cameraCharRef = useRef(getActiveCharacterInfo().id);
  useEffect(() => subscribeActiveCharacter(() => {
    const nextId = getActiveCharacterInfo().id;
    if (nextId !== cameraCharRef.current) {
      cameraCharRef.current = nextId;
      camera.stop();
    }
  }), [camera.stop]);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(false);
  const [audioTalking, setAudioTalking] = useState(false);
  useEffect(() => {
    void getTtsAutoPlay().then(auto => setTtsAutoPlay(auto.video_call)).catch(() => {});
    const refresh = () => void getTtsAutoPlay().then(auto => setTtsAutoPlay(auto.video_call)).catch(() => {});
    window.addEventListener('desktop-tts-settings', refresh);
    window.addEventListener('tts-auto-play-settings', refresh);
    return () => {
      window.removeEventListener('desktop-tts-settings', refresh);
      window.removeEventListener('tts-auto-play-settings', refresh);
    };
  }, []);

  // Assistant bubble: buffer/revealed VN presenter (see turnIngest.ts / useVnPresenter.ts)
  const presenter = useVnPresenter({ onWatchdogTimeout: () => setSending(false) });

  // `sending` only tracks the user-facing input-disable window; the presenter owns turn/text
  // lifecycle entirely. stream_end normally clears it, onWatchdogTimeout above covers the case
  // where the WS dies mid-stream and stream_end never arrives.
  useEffect(() => {
    const acceptedStreams = new Set<string>();
    const unStart = wsClient.on('message_stream_start', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id)) return;
      acceptedStreams.add(message.msg_id);
      setSending(true);
    });
    const unEnd = wsClient.on('message_stream_end', message => {
      if (acceptedStreams.delete(message.msg_id) && acceptedStreams.size === 0) {
        sendingRef.current = false;
        setSending(false);
      }
    });
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
    if (sendingRef.current) return;
    const trimmed = joinTranscript(speechDraftRef.current, text).trim().slice(0, 12_000);
    if (!trimmed) return;
    speechDraftRef.current = '';
    const audioSource = audioReceiptsRef.current.length ? audioReceiptsRef.current : undefined;
    audioReceiptsRef.current = [];
    if (audioSource) setAudioStatus(null);
    setSpeechDraft('');
    setChatInput('');
    sendingRef.current = true;
    setSending(true);

    // Show user bubble
    setUserBubble({ text: trimmed, visible: true });
    if (userBubbleTimerRef.current) clearTimeout(userBubbleTimerRef.current);
    userBubbleTimerRef.current = setTimeout(
      () => setUserBubble(prev => ({ ...prev, visible: false })),
      3000,
    );

    try {
      const result = await sendChat(trimmed, undefined, camera.takeLatestObservation(), audioSource);
      if (audioSource && !result.audio_perception_applied) setAudioStatus(t('room.call.voice.textOnly'));
      sendingRef.current = false;
      setSending(false);
    } catch {
      setChatInput(trimmed);
      sendingRef.current = false;
      setSending(false);
    }
  }, [camera.takeLatestObservation]);

  useEffect(() => {
    if (sending || !speechDraft) return;
    // Poll: only send once nothing is being said, queued or transcribed.
    const timer = setInterval(() => {
      if (sendingRef.current || !speechDraftRef.current) return;
      if (canAutoSend(voice.getActivity(), Date.now())) void handleSend('');
    }, 250);
    return () => clearInterval(timer);
  }, [sending, speechDraft, handleSend, voice.getActivity]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(chatInput);
    }
  }, [chatInput, handleSend]);

  const handleMicClick = useCallback(async () => {
    if (voice.recording) {
      voice.stop();
    } else {
      await voice.start();
    }
  }, [voice]);

  // ── styles ────────────────────────────────────────────────────────────────

  const btnBase: React.CSSProperties = {
    width: 44, height: 44, borderRadius: '50%',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  };

  return (
    <div
      className="call-room"
      data-talking={ttsAutoPlay ? audioTalking : presenter.talking}
      role="dialog"
      aria-label={t('room.call.title')}
      aria-modal
      style={{
        '--call-hue': MOOD_TABLE[mood].auraHue,
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        background: 'oklch(0.08 0.02 240)',
        outline: '2px solid var(--accent, oklch(0.55 0.18 210))',
        boxShadow: '0 0 40px var(--dt-glow-1, oklch(0.55 0.18 210 / 0.25)), 0 0 80px var(--dt-glow-2, oklch(0.55 0.18 210 / 0.10))',
      } as React.CSSProperties}
    >
      {/* top bar */}
      <div className="call-room__header" style={{
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
      <div className="call-room__stage" style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {renderMode === 'live2d' ? (
          <Live2DCallStage mood={mood} talking={ttsAutoPlay ? audioTalking : presenter.talking} grade={roomSettings.grade} />
        ) : (
          <ThreeCallStage
            ref={threeStageRef}
            mood={mood}
            talking={ttsAutoPlay ? audioTalking : presenter.talking}
            settings={roomSettings}
            onSceneStateChange={handleSceneStateChange}
            onCameraPresetsChange={handleCameraPresetsChange}
          />
        )}

        {renderMode === 'live2d' && live2dEdit && <Live2DEditorPanel settings={roomSettings} />}

        <div className="call-room__ambience" aria-hidden="true"><i /><i /><i /></div>
        <div className="call-room__camera-preview" style={{ display: camera.on ? 'block' : 'none' }}>
          <video ref={camera.videoRef} autoPlay playsInline muted aria-label={t('room.call.camera.preview')} />
          <span>{camera.status}</span>
        </div>
        <div className="call-room__presence" role="status">
          <span className="call-room__wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          {t((ttsAutoPlay ? audioTalking : presenter.talking) ? 'room.call.speaking' : sending ? 'room.call.thinking' : 'room.call.listening')}
        </div>
        {/* Assistant VN bubble — bottom center */}
        {ttsAutoPlay ? <CallSpeechPresenter name={charName} onPlayingChange={setAudioTalking} /> : presenter.bubble && (
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
        {/* Status overlays float over the stage; in-flow they resized it (canvas flash/fold). */}
        {(voice.error || speechDraft) && <div role={voice.error ? 'alert' : 'status'} className={voice.error ? 'call-room__voice-error' : 'call-room__voice-status'}>{voice.error || `${t('room.call.voice.heard')}: ${speechDraft}`}</div>}
        {audioStatus && <div role="status" className="call-room__voice-status">{audioStatus}</div>}
      </div>

      {/* chat input bar */}
      <div className="call-room__composer" style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: 'oklch(0.10 0.02 240 / 0.90)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid oklch(0.25 0.05 240 / 0.6)',
        flexShrink: 0,
      }}>
        {/* mic button */}
        <button
          title={t(voice.recording ? 'room.call.voice.stop' : 'room.call.voice.start')}
          onClick={handleMicClick}
          style={{
            flexShrink: 0,
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: voice.recording ? 'oklch(0.50 0.22 25)' : 'oklch(0.18 0.03 240)',
            color: voice.recording ? '#fff' : 'oklch(0.60 0.05 240)',
            boxShadow: voice.recording ? '0 0 8px oklch(0.50 0.22 25 / 0.6)' : 'none',
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
          disabled={sending}
          style={{
            flex: 1, height: 36,
            background: 'oklch(0.15 0.02 240)',
            border: '1px solid oklch(0.28 0.05 240 / 0.7)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'oklch(0.90 0.03 240)',
            fontSize: 13, padding: '0 12px',
            fontFamily: 'var(--font-ui, inherit)',
            outline: 'none',
            opacity: sending ? 0.5 : 1,
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
      <div className="call-room__controls" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
        padding: '16px 24px',
        background: 'oklch(0.10 0.02 240 / 0.90)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid oklch(0.25 0.05 240 / 0.6)',
        flexShrink: 0,
      }}>
        <button
          title={t(camera.on ? 'room.call.camera.close' : 'room.call.camera.open')}
          aria-pressed={camera.on}
          onClick={() => { if (camera.on) camera.stop(); else void camera.start(); }}
          style={{ ...btnBase, background: camera.on ? 'oklch(0.42 0.15 250)' : 'oklch(0.22 0.03 240)', color: camera.on ? '#fff' : 'oklch(0.65 0.05 240)' }}
        >
          <Icon name="video" size={20} />
        </button>

        {/* Live2D has no placement/free-look, but it can still be color-graded */}
        {renderMode === 'live2d' && (
          <button
            title={t('room.editor.title')}
            aria-pressed={editMode}
            onClick={() => setLive2dEdit(v => !v)}
            style={{
              ...btnBase,
              background: editMode ? 'oklch(0.40 0.14 60)' : 'oklch(0.22 0.03 240)',
              color: editMode ? 'oklch(0.92 0.06 60)' : 'oklch(0.55 0.05 240)',
              outline: editMode ? '2px solid oklch(0.62 0.18 60)' : 'none',
              fontSize: 18,
            }}
          >
            🛠
          </button>
        )}

        {/* placement mode / free look / save view — 3D-only */}
        {renderMode === 'model3d' && (
          <>
            <button
              title={t(placementMode ? 'room.call.placement.exit' : 'room.call.placement.enter')}
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
              title={t(freeLook ? 'room.call.freeLook.exit' : 'room.call.freeLook.enter')}
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
                title={t('room.call.saveView')}
                onClick={() => threeStageRef.current?.saveCurrentView()}
                style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.72 0.12 142)' }}
              >
                <Icon name="bookmark" size={20} />
              </button>
            )}

            <button
              type="button"
              title={t('room.call.bringCharacterToView')}
              aria-label={t('room.call.bringCharacterToView')}
              onClick={() => threeStageRef.current?.bringCharacterToView()}
              style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.83 0.06 210)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" /><circle cx="12" cy="12" r="5.5" />
                <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </>
        )}

        {/* hang up */}
        <button
          className="call-room__hangup"
          title={t('room.call.hangup')}
          onClick={() => { camera.stop(); voice.stop(true); onClose(); }}
          style={{ ...btnBase, width: 52, height: 52, background: 'oklch(0.52 0.22 25)', color: '#fff' }}
        >
          <Icon name="phone-off" size={22} />
        </button>
      </div>
      {renderMode === 'model3d' && (
        <div className="call-room__camera-menu">
          {presetMenuOpen && <div className="call-room__camera-presets" role="group" aria-label={t('room.call.sceneCameras.menu')}>
              <div className="call-room__camera-presets-title">{t('room.call.sceneCameras.title')}</div>
              {cameraPresets.length === 0 ? (
                <div className="call-room__camera-presets-empty">{t('room.call.sceneCameras.empty')}</div>
              ) : cameraPresets.map(preset => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={roomSettings.sceneCameraByScene?.[roomSettings.sceneFile] === preset.id}
                  onClick={() => {
                    if (threeStageRef.current?.applyCameraPreset(preset.id)) setPresetMenuOpen(false);
                  }}
                >{preset.name}</button>
              ))}
          </div>}
          <button
            type="button"
            className="call-room__camera-menu-trigger"
            aria-label={t('room.call.sceneCameras.menu')}
            aria-expanded={presetMenuOpen}
            title={t('room.call.sceneCameras.menu')}
            onClick={() => setPresetMenuOpen(open => !open)}
          >{presetMenuOpen ? '×' : '⋯'}</button>
        </div>
      )}
    </div>
  );
}
