import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { getActiveCharacterName } from '../../../../shared/activeCharacter';
import { COMPUTER_OPERATION_TAURI_COMMANDS } from './preferencesInfoArchitecture';

type MetaMode = { mode: 'safe' | 'danger'; expires_at: number | null };

function formatRemaining(expiresAt: number | null, now: number) {
  if (!expiresAt) return '';
  const seconds = Math.max(0, Math.ceil(expiresAt - now / 1000));
  const minutes = Math.ceil(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  return `${minutes} 分钟`;
}

export function ComputerOperationSafetySettings() {
  const [metaMode, setMetaMode] = useState<MetaMode | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    setModeError('');
    void invoke<MetaMode>(COMPUTER_OPERATION_TAURI_COMMANDS[0])
      .then(mode => { if (active) setMetaMode(mode); })
      .catch(error => { if (active) setModeError(`读取安全模式失败：${String(error)}`); });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const dangerActive = metaMode?.mode === 'danger'
    && (!metaMode.expires_at || metaMode.expires_at > now / 1000);
  const remaining = dangerActive ? formatRemaining(metaMode?.expires_at ?? null, now) : '';

  async function toggleDangerMode() {
    setModeBusy(true);
    setModeError('');
    try {
      const nextMode = dangerActive ? 'safe' : 'danger';
      const updated = await invoke<MetaMode>(COMPUTER_OPERATION_TAURI_COMMANDS[1], {
        mode: nextMode,
        ttlSeconds: nextMode === 'danger' ? 7200 : null,
      });
      setMetaMode(updated);
      setNow(Date.now());
    } catch (error) {
      setModeError(`切换安全模式失败：${String(error)}`);
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>电脑操作权限</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          危险模式启用后允许角色执行受限的电脑操作
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{dangerActive ? '危险模式已开启' : '安全模式'}</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.8, marginTop: 2 }}>
            {dangerActive
              ? `允许${getActiveCharacterName()}操作电脑${remaining ? `，将在 ${remaining} 后自动收回` : ''}`
              : `${getActiveCharacterName()}不能打开网页、播放歌曲、最小化窗口或发送系统通知`}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={dangerActive}
          disabled={modeBusy || metaMode === null}
          onClick={() => void toggleDangerMode()}
          style={{
            minWidth: 94, padding: '7px 12px', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${dangerActive ? 'var(--accent)' : 'var(--paper-edge)'}`,
            background: dangerActive ? 'var(--accent)' : 'var(--paper-2)',
            color: dangerActive ? 'white' : 'var(--ink-2)', fontFamily: 'inherit', fontSize: 11.5,
            fontWeight: 600, cursor: modeBusy || metaMode === null ? 'wait' : 'pointer',
            opacity: modeBusy || metaMode === null ? 0.6 : 1,
          }}
        >
          {modeBusy ? '切换中…' : dangerActive ? '关闭危险模式' : '开启危险模式'}
        </button>
      </div>
      <div style={{
        padding: '10px 12px', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
        background: dangerActive ? 'oklch(0.95 0.04 35)' : 'var(--paper-2)',
        color: dangerActive ? 'oklch(0.42 0.12 35)' : 'var(--ink-3)', fontSize: 11.5, lineHeight: 1.65,
      }}>
        危险模式允许{getActiveCharacterName()}操作你的电脑，包括开浏览器、放歌、最小化窗口和通知。开启后 2 小时自动回到安全模式；关机和睡眠仍需单独确认。
      </div>
      {modeError && <div style={{ color: 'var(--danger, #a33)', fontSize: 11.5 }}>{modeError}</div>}
    </div>
  );
}
