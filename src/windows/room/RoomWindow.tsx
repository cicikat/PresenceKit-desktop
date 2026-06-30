import { useEffect, useRef, useState } from 'react';
import { Icon } from '../chat/components/UIKit';
import { listenPetSnapshots } from '../../shared/pet/bridge';
import { DEFAULT_PET_SNAPSHOT } from '../../shared/pet/types';
import type { Mood } from '../../shared/state/store';
import { useRoomScene } from './useRoomScene';
import { loadRoomSettings, subscribeRoomSettings } from '../../shared/room/roomSettings';
import type { RoomSettings } from '../../shared/room/roomSettings';
import { setupAvatarDirectiveListener } from './avatarDirective';

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

export function RoomWindow({ onClose }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<Mood>(DEFAULT_PET_SNAPSHOT.mood);
  const [latestAssistantText, setLatestAssistantText] = useState<string | null>(null);
  const [textUpdatedAt, setTextUpdatedAt] = useState<number>(0);
  const [roomSettings, setRoomSettings] = useState<RoomSettings>(loadRoomSettings);
  const elapsed = useTick();

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listenPetSnapshots(snap => {
      setMood(snap.mood);
      setLatestAssistantText(snap.latestAssistantText);
      setTextUpdatedAt(snap.updatedAt);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    return subscribeRoomSettings(setRoomSettings);
  }, []);

  useEffect(() => {
    return setupAvatarDirectiveListener();
  }, []);

  const { freeLook, toggleFreeLook, saveCurrentView, placementMode, togglePlacementMode } = useRoomScene(
    mountRef, mood, latestAssistantText, textUpdatedAt, roomSettings,
  );

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
          叶瑄
        </span>
        <span style={{
          color: 'oklch(0.60 0.03 240)', fontSize: 13,
          fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1,
        }}>
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Three.js canvas container */}
      <div ref={mountRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {freeLook && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'oklch(0.15 0.03 240 / 0.80)', color: 'oklch(0.75 0.05 240)',
            fontSize: 11, padding: '4px 12px', borderRadius: 6, pointerEvents: 'none',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0.8, zIndex: 5,
            backdropFilter: 'blur(4px)',
          }}>
            拖拽旋转 · 滚轮缩放 · 右键平移
          </div>
        )}
        {placementMode && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'oklch(0.15 0.03 60 / 0.82)', color: 'oklch(0.82 0.06 60)',
            fontSize: 11, padding: '4px 14px', borderRadius: 6, pointerEvents: 'none',
            fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0.8, zIndex: 5,
            backdropFilter: 'blur(4px)',
          }}>
            点选角色/灯光/道具 · G移动 R旋转 S缩放 · X/Y/Z 锁轴 · ←→ 调灯强度 · Esc 退出
          </div>
        )}
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
        {/* mute — Phase 1 placeholder */}
        <button
          title="静音（Phase 3 启用）"
          disabled
          style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.50 0.03 240)', opacity: 0.5 }}
        >
          <Icon name="mic" size={20} />
        </button>

        {/* camera — Phase 3 MediaPipe placeholder */}
        <button
          title="摄像头（Phase 3 启用）"
          disabled
          style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.50 0.03 240)', opacity: 0.5 }}
        >
          <Icon name="video" size={20} />
        </button>

        {/* placement mode */}
        <button
          title={placementMode ? '退出摆放模式' : '摆放模式（点选物体拖动）'}
          onClick={togglePlacementMode}
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

        {/* free look toggle */}
        <button
          title={freeLook ? '退出自由视角' : '调整视角（自由视角）'}
          onClick={toggleFreeLook}
          style={{
            ...btnBase,
            background: freeLook ? 'oklch(0.42 0.15 250)' : 'oklch(0.22 0.03 240)',
            color: freeLook ? 'oklch(0.92 0.04 240)' : 'oklch(0.55 0.05 240)',
            outline: freeLook ? '2px solid oklch(0.55 0.18 210)' : 'none',
          }}
        >
          <Icon name="move" size={20} />
        </button>

        {/* save current view (only visible in free look) */}
        {freeLook && (
          <button
            title="保存当前视角"
            onClick={saveCurrentView}
            style={{ ...btnBase, background: 'oklch(0.22 0.03 240)', color: 'oklch(0.72 0.12 142)' }}
          >
            <Icon name="bookmark" size={20} />
          </button>
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
