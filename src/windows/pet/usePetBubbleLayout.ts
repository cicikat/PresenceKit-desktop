import { useEffect, useRef, useState } from 'react';
import { availableMonitors, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window';
import { getUIPref } from '../../shared/uiPreferences';
import { listenPetPrefs } from '../../shared/pet/bridge';
import { petBubbleLayout, type BubbleSide } from './petBubbleLayout';

/** Extend only the transparent side wing; never resize or recenter the model canvas. */
export function usePetBubbleLayout(visible: boolean) {
  const [scale, setScale] = useState(() => getUIPref('pet.windowScale', 1));
  const config = useRef({ visible, scale });
  config.current = { visible, scale };
  const [layout, setLayout] = useState({ petLeft: 0, stageWidth: 340 * scale, wing: 300 * scale, side: 'right' as BubbleSide });
  // Keep the physical stage offset while bubble visibility, zoom or DPI changes.
  const [geometry] = useState(() => ({ petLeft: 0, stageWidth: 340 * scale * window.devicePixelRatio, side: 'right' as BubbleSide }));
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void listenPetPrefs(p => { if (typeof p.windowScale === 'number') setScale(p.windowScale); })
      .then(fn => { if (disposed) fn(); else off = fn; }).catch(console.warn);
    return () => { disposed = true; off?.(); };
  }, []);
  useEffect(() => {
    let disposed = false;
    let timer = 0;
    const win = getCurrentWindow();
    const tick = async () => {
      try {
        const [position, monitors] = await Promise.all([win.outerPosition(), availableMonitors()]);
        if (disposed) return;
        const dpi = window.devicePixelRatio || 1;
        const { scale: requestedScale, visible: showBubble } = config.current;
        const zoom = Number.isFinite(requestedScale) ? Math.max(0.5, Math.min(2, requestedScale)) : 1;
        const anchor = { x: position.x + geometry.petLeft, y: position.y, width: geometry.stageWidth, height: 400 * zoom * dpi };
        const centerX = anchor.x + anchor.width / 2;
        const centerY = anchor.y + anchor.height / 2;
        const monitor = monitors.find(m => centerX >= m.workArea.position.x && centerX < m.workArea.position.x + m.workArea.size.width
          && centerY >= m.workArea.position.y && centerY < m.workArea.position.y + m.workArea.size.height) ?? monitors[0];
        if (!monitor) return;
        const a = monitor.workArea;
        const next = petBubbleLayout(anchor, { x: a.position.x, y: a.position.y, width: a.size.width, height: a.size.height }, zoom, dpi, showBubble, geometry.side);
        const signature = `${next.width}:${next.height}:${dpi}`;
        if (signature !== lastSize) {
          await win.setSize(new LogicalSize(next.width / dpi, next.height / dpi));
          lastSize = signature;
        }
        if (disposed) return;
        if (position.x !== next.x || position.y !== next.y) await win.setPosition(new PhysicalPosition(next.x, next.y));
        geometry.petLeft = next.petLeft;
        geometry.stageWidth = next.stageWidth;
        geometry.side = next.side;
        if (!disposed) setLayout(old => old.petLeft === next.petLeft / dpi && old.stageWidth === next.stageWidth / dpi && old.wing === next.wing / dpi && old.side === next.side
          ? old : { petLeft: next.petLeft / dpi, stageWidth: next.stageWidth / dpi, wing: next.wing / dpi, side: next.side });
      } catch {
        // Browser preview has no native placement APIs; retain the side-by-side fallback.
      } finally { if (!disposed) timer = window.setTimeout(tick, 160); }
    };
    let lastSize = '';
    void tick();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [geometry]);
  return layout;
}
