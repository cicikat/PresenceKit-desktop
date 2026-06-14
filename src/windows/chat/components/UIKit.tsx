/* ============================================================
 * UIKit — 共用小组件 & 样式工具
 * 迁移自: Emerald-desktopUI/ui-kit.jsx
 * ============================================================ */

export { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { chatThemeFontSize } from '../../../shared/chatAppearance';

export const MOOD_HUE: Record<string, number> = {
  '平静': 72,
  '开心': 55,
  '低落': 232,
  '病娇': 16,
  '分心': 295,
  '生气': 8,
  '惊讶': 52,
};

export const MOOD_LABEL_EN: Record<string, string> = {
  '平静': 'CALM',
  '开心': 'BRIGHT',
  '低落': 'LOW',
  '病娇': 'YANDERE',
  '分心': 'ADRIFT',
  '生气': 'ANGRY',
  '惊讶': 'SURPRISED',
};

export const FOCUS_LABEL_EN: Record<string, string> = {
  '看你':        'WATCHING YOU',
  '发呆':        'DAZING',
  '想事情':      'THINKING',
  '看屏幕':      'GLANCING SCREEN',
  '看你打字':    'WATCHING TYPING',
  '偷看':        'PEEKING',
  '注意到了什么': 'NOTICED',
};

export function Tag({ children, hue, variant = 'solid', size = 'sm' }: any) {
  const fontSize = chatThemeFontSize(size === 'sm' ? 9.5 : 10.5);
  const pad = size === 'sm' ? '2px 6px' : '3px 8px';
  if (variant === 'outline') {
    return (
      <span className="mono" style={{
        display: 'inline-block', padding: pad, fontSize, letterSpacing: 1.2, fontWeight: 600,
        border: `1px solid ${hue ? `oklch(0.50 0.10 ${hue})` : 'var(--paper-edge)'}`,
        borderRadius: 'var(--radius-xs)',
        color: hue ? `oklch(0.40 0.12 ${hue})` : 'var(--ink-2)',
        textTransform: 'uppercase' as const,
        background: 'transparent',
      }}>{children}</span>
    );
  }
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: pad, fontSize, letterSpacing: 1.2, fontWeight: 700,
      background: hue ? `oklch(0.38 0.13 ${hue})` : 'var(--ink)',
      color: hue ? `oklch(0.97 0.04 ${hue})` : 'var(--paper)',
      borderRadius: 'var(--radius-xs)',
      textTransform: 'uppercase' as const,
    }}>{children}</span>
  );
}

export function Card({ children, style, label, accent, dark }: any) {
  return (
    <div style={{
      position: 'relative',
      background: dark ? 'var(--ink)' : 'var(--paper-2)',
      color: dark ? 'var(--paper)' : 'var(--ink)',
      border: '1px solid var(--paper-edge)',
      borderRadius: 'var(--radius-md)',
      padding: 14,
      boxShadow: '0 1px 0 oklch(0.86 0.03 65), 0 12px 28px -16px oklch(0.30 0.04 60 / 0.25)',
      ...style,
    }}>
      {label && (
        <span style={{ position: 'absolute', top: 10, right: 10 }}>
          <Tag hue={accent}>{label}</Tag>
        </span>
      )}
      {children}
    </div>
  );
}

export function MicroLabel({ children, style }: any) {
  return <div className="smcaps" style={{ color: 'var(--ink-3)', ...style }}>{children}</div>;
}

export function HRule({ color }: any) {
  return <div style={{ height: 1, background: color || 'var(--paper-edge)', margin: '12px 0' }} />;
}

export function Numeric({ children, size = 28, color }: any) {
  return (
    <span className="serif" style={{
      fontSize: chatThemeFontSize(size), fontWeight: 600, letterSpacing: -0.5,
      color: color || 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
    }}>{children}</span>
  );
}

export function Icon({ name, size = 18, stroke = 'currentColor', strokeWidth = 1.6 }: any) {
  const s = size;
  const common: any = {
    width: s, height: s, viewBox: '0 0 24 24', fill: 'none',
    stroke, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'chat':    return <svg {...common}><path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 10h8M8 13h5"/></svg>;
    case 'diary':   return <svg {...common}><path d="M5 4h13v16H5z"/><path d="M5 4v16M9 8h7M9 12h7M9 16h4"/></svg>;
    case 'heart':   return <svg {...common}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>;
    case 'garden':  return <svg {...common}><path d="M12 20V10"/><path d="M12 10c-2 0-4-1.5-4-4 2 0 4 1.5 4 4z"/><path d="M12 10c2 0 4-1.5 4-4-2 0-4 1.5-4 4z"/><path d="M6 20h12"/></svg>;
    case 'plus':    return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'send':    return <svg {...common}><path d="M4 20l16-8L4 4l3 8-3 8z"/><path d="M7 12h13"/></svg>;
    case 'attach':  return <svg {...common}><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8"/></svg>;
    case 'settings':return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.5 4.5l2 2M17.5 17.5l2 2M19.5 4.5l-2 2M6.5 17.5l-2 2"/></svg>;
    case 'logo':    return <svg {...common} viewBox="0 0 32 32"><path d="M16 4 L8 12 V26 H24 V12 Z"/><path d="M12 26 V18 H20 V26"/><circle cx="16" cy="9" r="1.6"/></svg>;
    case 'book':    return <svg {...common}><path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-3a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h4z"/></svg>;
    case 'sparkle': return <svg {...common}><path d="M12 4v6M12 14v6M4 12h6M14 12h6"/></svg>;
    case 'mood':    return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r=".5" fill={stroke}/><circle cx="15" cy="10" r=".5" fill={stroke}/></svg>;
    case 'eye':     return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'pulse':   return <svg {...common}><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>;
    case 'clock':   return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'leaf':    return <svg {...common}><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19c4-4 8-8 14-14"/></svg>;
    case 'flower':  return <svg {...common}><circle cx="12" cy="9" r="2"/><path d="M12 9c0-3-2-4-4-3s-1 4 1 5M12 9c0-3 2-4 4-3s1 4-1 5M12 9c3 0 4 2 3 4s-4 1-5-1M12 9c-3 0-4 2-3 4s4 1 5-1"/><path d="M12 13v9"/></svg>;
    case 'menu':    return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'pet':     return <svg {...common}><circle cx="12" cy="13" r="6"/><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="10" cy="13" r=".6" fill={stroke}/><circle cx="14" cy="13" r=".6" fill={stroke}/></svg>;
    case 'wind':    return <svg {...common}><path d="M4 10h12a3 3 0 1 0-3-3M4 14h16a3 3 0 1 1-3 3"/></svg>;
    case 'spec':    return <svg {...common}><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/></svg>;
    case 'grid2':   return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    default:        return <svg {...common}><circle cx="12" cy="12" r="4"/></svg>;
  }
}

export function Btn({ children, onClick, variant = 'ghost', icon, dense, hue, active }: any) {
  const base: any = {
    fontFamily: 'inherit', fontSize: chatThemeFontSize(dense ? 11.5 : 12.5),
    padding: dense ? '5px 10px' : '7px 14px',
    borderRadius: 'var(--radius-sm)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    cursor: 'pointer',
    letterSpacing: 0.3,
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  };
  if (variant === 'solid') {
    return <button style={{ ...base, border: '1px solid var(--ink)', background: 'var(--ink)', color: 'var(--paper)', fontWeight: 600 }} onClick={onClick}>{icon && <Icon name={icon} size={14} />}{children}</button>;
  }
  if (variant === 'accent') {
    return <button style={{ ...base, border: `1px solid var(--accent)`, background: 'var(--accent)', color: 'var(--paper)', fontWeight: 600 }} onClick={onClick}>{icon && <Icon name={icon} size={14} />}{children}</button>;
  }
  return (
    <button style={{
      ...base,
      border: '1px solid var(--paper-edge)',
      background: active ? 'var(--paper-3)' : 'var(--paper-2)',
      color: 'var(--ink)',
      fontWeight: active ? 600 : 500,
    }} onClick={onClick}>{icon && <Icon name={icon} size={14} />}{children}</button>
  );
}

export function Meter({ value, max = 1, hue, label, ticks = true }: any) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <MicroLabel>{label}</MicroLabel>
          <span className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'var(--ink-2)' }}>{(pct * 100).toFixed(0)}%</span>
        </div>
      )}
      <div style={{
        position: 'relative', height: 6,
        background: 'var(--paper-3)',
        border: '1px solid var(--paper-edge)',
        borderRadius: 'var(--radius-xs)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: hue ? `oklch(0.62 0.13 ${hue})` : 'var(--accent)',
          transition: 'width 0.5s ease',
        }} />
        {ticks && Array.from({ length: 9 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, bottom: 0, left: `${(i + 1) * 10}%`,
            width: 1, background: 'oklch(0.50 0.02 60 / 0.10)',
          }} />
        ))}
      </div>
    </div>
  );
}

export function Body({ children, dim, style }: any) {
  return <div style={{ fontSize: chatThemeFontSize(13), lineHeight: 1.65, color: dim ? 'var(--ink-2)' : 'var(--ink)', ...style }}>{children}</div>;
}
