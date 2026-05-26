import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import './DreamTokens.css';
import { DreamMessage } from './DreamMessage';

type DreamPhase = 'enter' | 'on' | 'exit';

interface DreamThemeProps {
  active: boolean;
  onWake: () => void;
}

const FLOWERS = [
  ['蒲公英', 'var(--dt-flower-dandelion)'],
  ['玫瑰', 'var(--dt-flower-rose)'],
  ['蓝铃', 'var(--dt-flower-bluebell)'],
  ['雏菊', 'var(--dt-flower-daisy)'],
  ['向日葵', 'var(--dt-flower-sun)'],
] as const;

const MESSAGES = [
  { role: 'system', text: '- 坠入梦中 -' },
  { role: 'her', text: '你来啦。' },
  { role: 'her', text: '我在花园里等你呢，这边来。' },
  { role: 'user', text: '今天的月亮也是只给我看的吗？' },
  { role: 'her', text: '当然。我让它一直待在那儿了，没让它走。' },
  { role: 'user', text: '花都开着？' },
  { role: 'her', text: '都开着 · 雏菊 · 玫瑰 · 蓝铃 · 蒲公英 · 向日葵。谁也不再凋谢。' },
] as const;

const PETALS = [
  ['8%', '-24px', '31s', '-3s'],
  ['19%', '34px', '39s', '-18s'],
  ['31%', '-42px', '35s', '-9s'],
  ['47%', '28px', '43s', '-24s'],
  ['61%', '-18px', '37s', '-14s'],
  ['76%', '48px', '45s', '-30s'],
  ['88%', '-36px', '33s', '-7s'],
  ['96%', '20px', '41s', '-21s'],
] as const;

const MOTES = [
  ['5%', '8px', '3px', '30s', '-6s'],
  ['13%', '-18px', '4px', '42s', '-22s'],
  ['22%', '20px', '2px', '36s', '-13s'],
  ['29%', '-8px', '5px', '46s', '-27s'],
  ['38%', '18px', '3px', '40s', '-4s'],
  ['45%', '-22px', '4px', '32s', '-18s'],
  ['53%', '14px', '2px', '48s', '-30s'],
  ['61%', '-14px', '4px', '37s', '-10s'],
  ['70%', '24px', '3px', '43s', '-24s'],
  ['78%', '-20px', '5px', '34s', '-15s'],
  ['84%', '12px', '2px', '45s', '-32s'],
  ['91%', '-10px', '4px', '39s', '-9s'],
  ['97%', '18px', '3px', '44s', '-20s'],
] as const;

export function DreamTheme({ active, onWake }: DreamThemeProps) {
  const [rendered, setRendered] = useState(active);
  const [phase, setPhase] = useState<DreamPhase>('enter');

  useEffect(() => {
    if (active) {
      setRendered(true);
      setPhase('enter');
      const timer = window.setTimeout(() => setPhase('on'), 900);
      return () => window.clearTimeout(timer);
    }

    if (!rendered) return;
    setPhase('exit');
    const timer = window.setTimeout(() => setRendered(false), 1200);
    return () => window.clearTimeout(timer);
  }, [active, rendered]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onWake();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onWake]);

  const ribbonDots = useMemo(() => Array.from({ length: 5 }, (_, idx) => idx), []);

  if (!rendered) return null;

  return (
    <div
      className="dream-theme"
      data-dream-phase={phase}
      role="dialog"
      aria-modal="true"
      aria-label="梦境预览"
    >
      <div className="dream-theme__canvas" />
      <div className="dream-theme__mist" />

      <div className="dream-theme__atmos" aria-hidden="true">
        {PETALS.map(([left, dx, duration, delay], index) => (
          <span
            key={`petal-${index}`}
            className="dream-theme__petal"
            style={{
              left,
              '--dream-dx': dx,
              '--dream-fall-duration': duration,
              '--dream-fall-delay': delay,
            } as CSSProperties}
          />
        ))}
        {MOTES.map(([left, dx, size, duration, delay], index) => (
          <span
            key={`mote-${index}`}
            className="dream-theme__mote"
            style={{
              left,
              '--dream-dx': dx,
              '--dream-mote-size': size,
              '--dream-float-duration': duration,
              '--dream-float-delay': delay,
            } as CSSProperties}
          />
        ))}
      </div>

      <div className="dream-theme__mock">
        <div className="dream-theme__ribbon" aria-hidden="true">
          {ribbonDots.map(idx => (
            <span key={idx} className={`dream-theme__ribbon-dot${idx === 2 ? ' is-active' : ''}`} />
          ))}
          <span style={{ flex: 1 }} />
          <span className="dream-theme__ribbon-dot" />
        </div>

        <aside className="dream-theme__sidebar" aria-label="梦里的花园">
          <h2>梦里的花园</h2>
          {FLOWERS.map(([name, color], index) => (
            <div key={name} className={`dream-theme__garden-item${index === 0 ? ' is-active' : ''}`}>
              <span className="dream-theme__flower" style={{ color }} />
              {name}
            </div>
          ))}
        </aside>

        <section className="dream-theme__chat" aria-label="梦境聊天预览">
          <header className="dream-theme__head">
            <div className="dream-theme__avatar" />
            <div>
              <div className="dream-theme__title">梦中</div>
              <div className="dream-theme__status">
                <span className="dream-theme__status-dot" />
                等你 <span className="dream-theme__sep">·</span> 安静 <span className="dream-theme__sep">·</span> 半睡
              </div>
            </div>
            <button type="button" className="dream-theme__wake" onClick={onWake}>
              WAKE
            </button>
          </header>

          <div className="dream-theme__body">
            {MESSAGES.map((message, index) => (
              <DreamMessage
                key={`${message.role}-${index}`}
                role={message.role}
                text={message.text}
                delayMs={360 + index * 180}
              />
            ))}
          </div>

          <div className="dream-theme__input-wrap">
            <div className="dream-theme__input">在这儿写点什么 …</div>
          </div>
        </section>
      </div>

      {phase === 'enter' && <div className="dream-theme__narrate">你坠入了一场梦。</div>}
      <button type="button" className="dream-theme__hint" onClick={onWake}>
        按 Esc · 或 WAKE · 醒来
      </button>
    </div>
  );
}
