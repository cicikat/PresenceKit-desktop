import type { CSSProperties } from 'react';

interface VnBubbleProps {
  name: string;
  text: string;
  nameAlign: 'left' | 'right';
  visible: boolean;
  /** 流式输出中，末尾显示光标 */
  streaming?: boolean;
  /** 处于段间等待期，显示"点击继续"提示 */
  canAdvance?: boolean;
  /** 淡出动画时长（ms）——打断用快速淡出，正常收尾用慢速淡出 */
  fadeMs?: number;
  onClick?: () => void;
  style?: CSSProperties;
}

export function VnBubble({
  name,
  text,
  nameAlign,
  visible,
  streaming,
  canAdvance,
  fadeMs = 500,
  onClick,
  style,
}: VnBubbleProps) {
  const isRight = nameAlign === 'right';

  return (
    <div
      onClick={onClick}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeMs}ms ease`,
        cursor: onClick ? 'pointer' : 'default',
        pointerEvents: onClick ? 'auto' : 'none',
        ...style,
      }}
    >
      <div style={{
        background: 'oklch(0.10 0.03 240 / 0.88)',
        border: `1px solid ${isRight
          ? 'oklch(0.40 0.06 240 / 0.35)'
          : 'oklch(0.55 0.18 210 / 0.45)'}`,
        borderRadius: 'var(--radius-lg, 12px)',
        boxShadow: isRight
          ? 'none'
          : '0 0 20px var(--dt-glow-1, oklch(0.55 0.18 210 / 0.18))',
        padding: '9px 14px',
        backdropFilter: 'blur(12px)',
        position: 'relative',
      }}>
        {/* name label */}
        <div style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono, monospace)',
          color: isRight
            ? 'oklch(0.48 0.04 240)'
            : 'oklch(0.55 0.18 210)',
          letterSpacing: 1.2,
          marginBottom: 4,
          textAlign: isRight ? 'right' : 'left',
        }}>
          {name}
        </div>

        {/* body text */}
        <div style={{
          color: isRight
            ? 'oklch(0.70 0.03 240)'
            : 'oklch(0.92 0.03 240)',
          fontSize: isRight ? 12.5 : 13.5,
          lineHeight: 1.6,
          fontFamily: 'var(--font-ui, inherit)',
          wordBreak: 'break-all',
          textAlign: isRight ? 'right' : 'left',
        }}>
          {text}
          {streaming && (
            <span style={{
              display: 'inline-block',
              width: 2, height: '1em',
              background: 'oklch(0.55 0.18 210)',
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'vn-cursor-blink 0.9s step-end infinite',
            }} />
          )}
        </div>

        {/* click-to-advance hint */}
        {canAdvance && (
          <div style={{
            marginTop: 6,
            textAlign: 'right',
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'oklch(0.40 0.06 240)',
            letterSpacing: 0.8,
          }}>
            点击继续 ▶
          </div>
        )}
      </div>
    </div>
  );
}
