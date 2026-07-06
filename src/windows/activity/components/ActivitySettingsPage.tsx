import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import { Icon } from '../../chat/components/UIKit';
import { ThemePicker } from '../../../shared/theme/ThemePicker';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import { getActiveCharacterName } from '../../../shared/activeCharacter';

type SettingsTab = '外观' | '系统设置' | '其他';
type MetaMode = { mode: 'safe' | 'danger'; expires_at: number | null };

const TABS: { key: SettingsTab; label: string }[] = [
  { key: '外观',   label: '1 · 外观' },
  { key: '系统设置', label: '2 · 系统设置' },
  { key: '其他',   label: '3 · 其他' },
];

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid var(--paper-edge)',
      gap: 20,
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function PrefSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11.5,
        padding: '5px 10px', borderRadius: 'var(--radius-sm)',
        background: 'var(--paper-2)', color: 'var(--ink)',
        border: '1px solid var(--paper-edge)',
        cursor: 'pointer',
      }}
    >{children}</select>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 10, letterSpacing: 1.5, fontWeight: 700,
      color: 'var(--ink-3)', marginBottom: 12, textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function formatRemaining(expiresAt: number | null, now: number) {
  if (!expiresAt) return '';
  const seconds = Math.max(0, Math.ceil(expiresAt - now / 1000));
  const minutes = Math.ceil(seconds / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  return `${minutes} 分钟`;
}

export function ActivityPreferencesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('外观');
  const [metaMode, setMetaMode] = useState<MetaMode | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeError, setModeError] = useState('');
  const [now, setNow] = useState(Date.now());

  const [fontSize, setFontSize] = useState(() => getUIPref('activity.reading.fontSize', 16));
  const [maxWidth, setMaxWidth] = useState(() => getUIPref('activity.reading.maxWidth', 760));
  const [boardTheme, setBoardTheme] = useState(() => getUIPref('activity.board.theme', 'classic_wood'));
  const [pieceStyle, setPieceStyle] = useState(() => getUIPref('activity.chess.pieceStyle', 'unicode'));
  const [showDebug, setShowDebug] = useState(() => getUIPref('activity.debug', false));

  useEffect(() => {
    if (!open) return;
    let active = true;
    setModeError('');
    void invoke<MetaMode>('get_meta_mode')
      .then(mode => {
        if (active) setMetaMode(mode);
      })
      .catch(error => {
        if (active) setModeError(`读取安全模式失败：${String(error)}`);
      });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  const dangerActive = metaMode?.mode === 'danger'
    && (!metaMode.expires_at || metaMode.expires_at > now / 1000);
  const remaining = dangerActive ? formatRemaining(metaMode?.expires_at ?? null, now) : '';

  async function toggleDangerMode() {
    setModeBusy(true);
    setModeError('');
    try {
      const nextMode = dangerActive ? 'safe' : 'danger';
      const updated = await invoke<MetaMode>('patch_meta_mode', {
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

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'oklch(0.20 0.04 60 / 0.45)',
        backdropFilter: 'blur(6px)',
        zIndex: 120,
        display: 'flex',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: 'min(540px, 92vw)',
          background: 'var(--paper)', border: '1px solid var(--paper-edge)',
          borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          boxShadow: '0 30px 80px var(--shadow-rgb-mix)',
        }}
      >
        {/* header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--paper-edge)',
          display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-2)',
        }}>
          <Icon name="settings" size={16} />
          <div className="serif" style={{ fontSize: 17, fontWeight: 600 }}>活动偏好</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.4 }}>
            ACTIVITY PREFERENCES
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--ink-3)', cursor: 'pointer',
              fontSize: 18, padding: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* tab bar */}
        <div style={{
          padding: '10px 20px 0', display: 'flex', gap: 4,
          borderBottom: '1px solid var(--paper-edge)',
        }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
              background: tab === key ? 'var(--paper)' : 'transparent',
              color: tab === key ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: tab === key ? 600 : 500,
              cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* tab content */}
        <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
          {tab === '外观' ? (
            <>
              <div>
                <SectionLabel>主题</SectionLabel>
                <SettingRow label="日间主题" hint="日间模式使用的主题">
                  <ThemePicker slot="day" />
                </SettingRow>
                <SettingRow label="夜间主题" hint="19:00–6:00 夜间模式使用的主题">
                  <ThemePicker slot="night" />
                </SettingRow>
              </div>
              <div>
                <SectionLabel>阅读</SectionLabel>
                <SettingRow label="字体大小" hint="阅读页面的正文字号">
                  <PrefSelect value={String(fontSize)} onChange={v => {
                    const n = Number(v);
                    setFontSize(n);
                    setUIPref('activity.reading.fontSize', n);
                  }}>
                    <option value="14">14px（小）</option>
                    <option value="16">16px（默认）</option>
                    <option value="18">18px（大）</option>
                  </PrefSelect>
                </SettingRow>
                <SettingRow label="页面宽度" hint="文字区域最大宽度">
                  <PrefSelect value={String(maxWidth)} onChange={v => {
                    const n = Number(v);
                    setMaxWidth(n);
                    setUIPref('activity.reading.maxWidth', n);
                  }}>
                    <option value="640">640px（窄）</option>
                    <option value="760">760px（默认）</option>
                    <option value="900">900px（宽）</option>
                  </PrefSelect>
                </SettingRow>
              </div>
              <div>
                <SectionLabel>棋盘游戏</SectionLabel>
                <SettingRow label="棋盘颜色" hint="五子棋 / 国际象棋棋盘配色">
                  <PrefSelect value={boardTheme} onChange={v => {
                    setBoardTheme(v);
                    setUIPref('activity.board.theme', v);
                  }}>
                    <option value="classic_wood">经典木质</option>
                    <option value="cool_grey">冷灰</option>
                  </PrefSelect>
                </SettingRow>
                <SettingRow label="棋子样式" hint="国际象棋棋子渲染风格">
                  <PrefSelect value={pieceStyle} onChange={v => {
                    setPieceStyle(v);
                    setUIPref('activity.chess.pieceStyle', v);
                  }}>
                    <option value="unicode">Unicode 符号</option>
                    <option value="letter">字母</option>
                  </PrefSelect>
                </SettingRow>
              </div>
            </>
          ) : tab === '系统设置' ? (
            <>
              <div>
                <SectionLabel>电脑操作权限</SectionLabel>
                <SettingRow
                  label={dangerActive ? '危险模式已开启' : '安全模式'}
                  hint={dangerActive
                    ? `允许${getActiveCharacterName()}操作电脑${remaining ? `，将在 ${remaining} 后自动收回` : ''}`
                    : `${getActiveCharacterName()}不能打开网页、播放歌曲、最小化窗口或发送系统通知`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={dangerActive}
                    disabled={modeBusy || metaMode === null}
                    onClick={() => void toggleDangerMode()}
                    style={{
                      minWidth: 94, padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${dangerActive ? 'var(--accent)' : 'var(--paper-edge)'}`,
                      background: dangerActive ? 'var(--accent)' : 'var(--paper-2)',
                      color: dangerActive ? 'white' : 'var(--ink-2)',
                      fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      cursor: modeBusy || metaMode === null ? 'wait' : 'pointer',
                      opacity: modeBusy || metaMode === null ? 0.6 : 1,
                    }}
                  >
                    {modeBusy ? '切换中…' : dangerActive ? '关闭危险模式' : '开启危险模式'}
                  </button>
                </SettingRow>
                <div style={{
                  marginTop: 10, padding: '10px 12px',
                  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
                  background: dangerActive ? 'oklch(0.95 0.04 35)' : 'var(--paper-2)',
                  color: dangerActive ? 'oklch(0.42 0.12 35)' : 'var(--ink-3)',
                  fontSize: 11.5, lineHeight: 1.65,
                }}>
                  危险模式允许{getActiveCharacterName()}操作你的电脑，包括开浏览器、放歌、最小化窗口和通知。
                  开启后 2 小时自动回到安全模式；关机和睡眠仍需单独确认。
                </div>
                {modeError && (
                  <div style={{ marginTop: 8, color: 'var(--danger, #a33)', fontSize: 11.5 }}>
                    {modeError}
                  </div>
                )}
              </div>
              <div>
                <SectionLabel>调试</SectionLabel>
                <SettingRow label="显示调试信息" hint="在活动页面显示 session_id / FEN 等原始数据">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showDebug}
                    onClick={() => {
                      const next = !showDebug;
                      setShowDebug(next);
                      setUIPref('activity.debug', next);
                    }}
                    style={{
                      minWidth: 60, padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${showDebug ? 'var(--accent)' : 'var(--paper-edge)'}`,
                      background: showDebug ? 'var(--accent)' : 'var(--paper-2)',
                      color: showDebug ? 'white' : 'var(--ink-2)',
                      fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {showDebug ? '开启' : '关闭'}
                  </button>
                </SettingRow>
              </div>
            </>
          ) : (
            <div className="serif" style={{
              padding: '20px 16px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-md)',
              color: 'var(--ink-3)', fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.7,
            }}>
              其他活动偏好待接入。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
