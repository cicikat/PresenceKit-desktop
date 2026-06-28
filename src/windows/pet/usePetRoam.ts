import { useEffect, useMemo, useRef, useState } from 'react';
import { availableMonitors, getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import {
  loadPetRoamSettings,
  subscribePetRoamSettings,
} from '../../shared/pet/petRoamSettings';

const ROAM_INTERVAL_MS = Math.round(1000 / 30); // 30fps
const ROAM_SPEED_PX = 3; // physical pixels per tick

export function usePetRoam({
  draggingRef,
  movingRef,
}: {
  draggingRef: { current: boolean };
  movingRef: { current: boolean };
}) {
  const petWindow = useMemo(() => getCurrentWindow(), []);
  const [settings, setSettings] = useState(loadPetRoamSettings);
  const dxRef = useRef(ROAM_SPEED_PX);
  const dyRef = useRef(ROAM_SPEED_PX);
  const disposedRef = useRef(false);

  useEffect(() => subscribePetRoamSettings(setSettings), []);

  useEffect(() => {
    disposedRef.current = false;
    return () => { disposedRef.current = true; };
  }, []);

  useEffect(() => {
    if (!settings.enabled) return;

    const angle = Math.random() * Math.PI * 2;
    dxRef.current = Math.cos(angle) * ROAM_SPEED_PX;
    dyRef.current = Math.sin(angle) * ROAM_SPEED_PX;

    let timer = 0;

    const tick = async () => {
      if (disposedRef.current) return;

      if (!draggingRef.current && !movingRef.current) {
        try {
          const [position, size, monitors] = await Promise.all([
            petWindow.outerPosition(),
            petWindow.outerSize(),
            availableMonitors(),
          ]);

          const centerX = position.x + size.width / 2;
          const centerY = position.y + size.height / 2;
          const monitor =
            monitors.find(m => {
              const a = m.workArea;
              return (
                centerX >= a.position.x &&
                centerX <= a.position.x + a.size.width &&
                centerY >= a.position.y &&
                centerY <= a.position.y + a.size.height
              );
            }) ?? monitors[0];

          if (monitor && !disposedRef.current) {
            const area = monitor.workArea;
            let nx = position.x + dxRef.current;
            let ny = position.y + dyRef.current;

            // Bounce off horizontal edges
            if (nx < area.position.x || nx + size.width > area.position.x + area.size.width) {
              dxRef.current = -dxRef.current;
              nx = position.x + dxRef.current;
            }
            // Bounce off vertical edges
            if (ny < area.position.y || ny + size.height > area.position.y + area.size.height) {
              dyRef.current = -dyRef.current;
              ny = position.y + dyRef.current;
            }

            nx = Math.max(
              area.position.x,
              Math.min(area.position.x + area.size.width - size.width, nx),
            );
            ny = Math.max(
              area.position.y,
              Math.min(area.position.y + area.size.height - size.height, ny),
            );

            await petWindow.setPosition(new PhysicalPosition(Math.round(nx), Math.round(ny)));
          }
        } catch {
          // No native window API in browser preview — keep running.
        }
      }

      if (!disposedRef.current) {
        timer = window.setTimeout(tick, ROAM_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(tick, ROAM_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [settings.enabled, petWindow, draggingRef, movingRef]);
}
