import { useState } from 'react';
import { Icon } from '../../chat/components/UIKit';

type SettingsTab = '外观' | '系统设置' | '其他';

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

function PlaceholderSelect({ label }: { label: string }) {
  return (
    <select disabled style={{
      fontFamily: 'var(--font-mono)', fontSize: 11.5,
      padding: '5px 10px', borderRadius: 5,
      background: 'var(--paper-2)', color: 'var(--ink-3)',
      border: '1px solid var(--paper-edge)',
      cursor: 'not-allowed', opacity: 0.6,
    }}>
      <option>{label}</option>
    </select>
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
  const [tab, setTab] = useState<SettingsTab>('外观');

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
          borderRadius: 10, overflow: 'hidden',
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
                <SectionLabel>阅读</SectionLabel>
                <SettingRow label="字体大小" hint="阅读页面的正文字号">
                  <PlaceholderSelect label="14px (默认)" />
                </SettingRow>
                <SettingRow label="页面宽度" hint="文字区域最大宽度">
                  <PlaceholderSelect label="640px (默认)" />
                </SettingRow>
              </div>
              <div>
                <SectionLabel>棋盘游戏</SectionLabel>
                <SettingRow label="棋盘颜色" hint="五子棋 / 国际象棋棋盘配色">
                  <PlaceholderSelect label="经典木质" />
                </SettingRow>
                <SettingRow label="棋子样式" hint="国际象棋棋子渲染风格">
                  <PlaceholderSelect label="Unicode 符号" />
                </SettingRow>
              </div>
            </>
          ) : tab === '系统设置' ? (
            <div>
              <SectionLabel>调试</SectionLabel>
              <SettingRow label="显示调试信息" hint="在活动页面显示 session_id / FEN 等原始数据">
                <PlaceholderSelect label="关闭 (默认)" />
              </SettingRow>
            </div>
          ) : (
            <div className="serif" style={{
              padding: '20px 16px', border: '1px dashed var(--paper-edge)', borderRadius: 6,
              color: 'var(--ink-3)', fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.7,
            }}>
              其他活动偏好待接入。
            </div>
          )}

          <div className="mono" style={{
            fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.5,
            padding: '10px 14px',
            background: 'var(--paper-2)', border: '1px solid var(--paper-edge)', borderRadius: 6,
          }}>
            上述设置尚未实装，后续版本接入。
          </div>
        </div>
      </div>
    </div>
  );
}
