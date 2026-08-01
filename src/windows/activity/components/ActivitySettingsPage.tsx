import { useState } from 'react';
import { Icon } from '../../chat/components/UIKit';
import { ThemePicker } from '../../../shared/theme/ThemePicker';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import { useI18n } from '../../../shared/i18n';
import { ACTIVITY_PREFERENCE_TABS, type ActivityPreferenceTab } from '../../chat/components/preferences/preferencesInfoArchitecture';


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

export function ActivityPreferencesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ActivityPreferenceTab>('appearance');

  const [fontSize, setFontSize] = useState(() => getUIPref('activity.reading.fontSize', 16));
  const [maxWidth, setMaxWidth] = useState(() => getUIPref('activity.reading.maxWidth', 760));
  const [boardTheme, setBoardTheme] = useState(() => getUIPref('activity.board.theme', 'classic_wood'));
  const [pieceStyle, setPieceStyle] = useState(() => getUIPref('activity.chess.pieceStyle', 'unicode'));
  const [showDebug, setShowDebug] = useState(() => getUIPref('activity.debug', false));

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
          {ACTIVITY_PREFERENCE_TABS.map(({ key, labelKey }, index) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '7px 14px', border: 'none', borderRadius: '6px 6px 0 0',
              background: tab === key ? 'var(--paper)' : 'transparent',
              color: tab === key ? 'var(--ink)' : 'var(--ink-3)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: tab === key ? 600 : 500,
              cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {index + 1} · {t(labelKey)}
            </button>
          ))}
        </div>

        {/* tab content */}
        <div style={{ padding: '18px 22px', display: 'grid', gap: 18 }}>
          {tab === 'appearance' ? (
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
          ) : (
            <>
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
          )}
        </div>
      </div>
    </div>
  );
}
