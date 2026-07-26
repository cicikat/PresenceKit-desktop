import { useEffect, useRef, type CSSProperties } from 'react';

export function Divider({ onDrag }: any) {
  const draggingRef = useRef(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (draggingRef.current) onDrag(e.clientX); };
    const onUp   = () => { draggingRef.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDrag]);
  return (
    <div
      onMouseDown={() => { draggingRef.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
      style={{ width: 5, flexShrink: 0, cursor: 'col-resize', position: 'relative', zIndex: 2 }}>
      <div style={{ position: 'absolute', left: 2, top: 0, bottom: 0, width: 1, background: 'var(--paper-edge)' }} />
      <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 5, height: 36, borderRadius: 'var(--radius-xs)', background: 'var(--paper-edge)', opacity: 0.5 }} />
    </div>
  );
}

/* ── 视频背景组件 ── */
export function VideoBg({ src, blur }: { src: string; blur: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onVis = () => { document.hidden ? el.pause() : el.play().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  return (
    <video
      ref={ref}
      className="chat-ui__background"
      src={src}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
      style={{ filter: `blur(${blur}px)`, objectFit: 'cover' } as CSSProperties}
    />
  );
}
