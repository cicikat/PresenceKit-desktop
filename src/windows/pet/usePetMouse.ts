import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  availableMonitors,
  cursorPosition,
  getCurrentWindow,
  type Monitor,
  PhysicalPosition,
} from '@tauri-apps/api/window';
import {
  loadPetMouseSettings,
  subscribePetMouseSettings,
  type PetMouseSettings,
} from '../../shared/pet/mouseSettings';
import type { PetMouseReaction } from '../../shared/pet/types';

const SHY_RADIUS = 105;
const SHY_STEP = 54;
const NUZZLE_STEP = 42;
const POLL_MS = 120;
const MOVE_STEPS = 7;
const MOVE_STEP_MS = 28;

const sleep = (milliseconds: number) => new Promise(resolve => window.setTimeout(resolve, milliseconds));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

function pointToRectDistance(
  x: number,
  y: number,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const dx = Math.max(left - x, 0, x - (left + width));
  const dy = Math.max(top - y, 0, y - (top + height));
  return Math.hypot(dx, dy);
}

function monitorForWindow(monitors: Monitor[], x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return monitors.find(monitor => {
    const area = monitor.workArea;
    return centerX >= area.position.x
      && centerX <= area.position.x + area.size.width
      && centerY >= area.position.y
      && centerY <= area.position.y + area.size.height;
  }) ?? monitors[0] ?? null;
}

function clampToMonitor(
  monitor: Monitor | null,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!monitor) return { x, y };
  const area = monitor.workArea;
  return {
    x: Math.min(area.position.x + Math.max(0, area.size.width - width), Math.max(area.position.x, x)),
    y: Math.min(area.position.y + Math.max(0, area.size.height - height), Math.max(area.position.y, y)),
  };
}

function randomBotherDelay(settings: PetMouseSettings) {
  const range = settings.botherMaxMinutes - settings.botherMinMinutes;
  return (settings.botherMinMinutes + Math.random() * range) * 60_000;
}

export function usePetMouse({ shy }: { shy: boolean }) {
  const petWindow = useMemo(() => getCurrentWindow(), []);
  const [settings, setSettings] = useState(loadPetMouseSettings);
  const [pinned, setPinned] = useState(false);
  const [reaction, setReaction] = useState<PetMouseReaction | null>(null);
  const settingsRef = useRef(settings);
  const pinnedRef = useRef(pinned);
  const draggingRef = useRef(false);
  const movingRef = useRef(false);
  const disposedRef = useRef(false);
  const reactionIdRef = useRef(0);
  const reactionTimerRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  const triggerReaction = useCallback((kind: PetMouseReaction['kind']) => {
    const next = { kind, id: ++reactionIdRef.current };
    setReaction(next);
    window.clearTimeout(reactionTimerRef.current);
    reactionTimerRef.current = window.setTimeout(() => setReaction(null), 850);
  }, []);

  const moveWindow = useCallback(async (direction: 'away' | 'toward') => {
    if (
      disposedRef.current
      || movingRef.current
      || draggingRef.current
      || pinnedRef.current
      || !settingsRef.current.enabled
    ) return false;

    movingRef.current = true;
    try {
      const [cursor, position, size, monitors] = await Promise.all([
        cursorPosition(),
        petWindow.outerPosition(),
        petWindow.outerSize(),
        availableMonitors(),
      ]);
      const centerX = position.x + size.width / 2;
      const centerY = position.y + size.height / 2;
      let dx = centerX - cursor.x;
      let dy = centerY - cursor.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        distance = Math.hypot(dx, dy);
      }
      const sign = direction === 'away' ? 1 : -1;
      const step = direction === 'away' ? SHY_STEP : Math.min(NUZZLE_STEP, distance * 0.22);
      const monitor = monitorForWindow(monitors, position.x, position.y, size.width, size.height);
      const target = clampToMonitor(
        monitor,
        position.x + sign * (dx / distance) * step,
        position.y + sign * (dy / distance) * step,
        size.width,
        size.height,
      );

      for (let index = 1; index <= MOVE_STEPS; index += 1) {
        if (disposedRef.current || draggingRef.current || pinnedRef.current || !settingsRef.current.enabled) break;
        const progress = easeOutCubic(index / MOVE_STEPS);
        await petWindow.setPosition(new PhysicalPosition(
          Math.round(position.x + (target.x - position.x) * progress),
          Math.round(position.y + (target.y - position.y) * progress),
        ));
        await sleep(MOVE_STEP_MS);
      }
      return true;
    } catch {
      return false;
    } finally {
      movingRef.current = false;
    }
  }, [petWindow]);

  useEffect(() => subscribePetMouseSettings(setSettings), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control') setPinned(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control') setPinned(false);
    };
    const onPointer = (event: PointerEvent) => setPinned(event.ctrlKey);
    const onBlur = () => setPinned(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    if (!settings.enabled || !shy) return;
    let checking = false;
    const timer = window.setInterval(async () => {
      if (checking || movingRef.current || draggingRef.current || pinnedRef.current) return;
      checking = true;
      try {
        const [cursor, position, size] = await Promise.all([
          cursorPosition(),
          petWindow.outerPosition(),
          petWindow.outerSize(),
        ]);
        if (pointToRectDistance(cursor.x, cursor.y, position.x, position.y, size.width, size.height) <= SHY_RADIUS) {
          if (await moveWindow('away')) triggerReaction('shy');
        }
      } catch {
        // A browser-only preview has no native window APIs; keep the pet visual running.
      } finally {
        checking = false;
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [moveWindow, petWindow, settings.enabled, shy, triggerReaction]);

  useEffect(() => {
    if (!settings.enabled) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (!pinnedRef.current && !draggingRef.current && await moveWindow('toward')) {
          triggerReaction('nuzzle');
        }
        schedule();
      }, randomBotherDelay(settingsRef.current));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [moveWindow, settings.enabled, triggerReaction]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      window.clearTimeout(reactionTimerRef.current);
    };
  }, []);

  const startDrag = useCallback(async (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (event.ctrlKey) setPinned(true);
    draggingRef.current = true;
    try {
      await petWindow.startDragging();
    } finally {
      draggingRef.current = false;
    }
  }, [petWindow]);

  return { settings, pinned, reaction, startDrag, draggingRef, movingRef };
}
