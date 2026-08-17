import { useEffect, useState } from 'react';
import type { DesignComponentId } from './contract';

type DesignMountMap = Partial<Record<DesignComponentId, HTMLElement>>;
let mounts: DesignMountMap = {};
let active = false;
const listeners = new Set<() => void>();

function notify(): void { listeners.forEach(listener => listener()); }

export function getDesignMounts(): DesignMountMap { return mounts; }
export function isDesignRuntimeActive(): boolean { return active; }
export function subscribeDesignMounts(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function setDesignRuntimeActive(value: boolean): void { if (active !== value) { active = value; notify(); } }
export function setDesignMount(id: DesignComponentId, mount: HTMLElement | null): void {
  if (mount) mounts = { ...mounts, [id]: mount };
  else {
    const next = { ...mounts };
    delete next[id];
    mounts = next;
  }
  notify();
}
export function clearDesignMounts(): void { mounts = {}; active = false; notify(); }

export function useDesignMounts(): { mounts: DesignMountMap; active: boolean } {
  const [, rerender] = useState(0);
  useEffect(() => { const listener = () => rerender(value => value + 1); return subscribeDesignMounts(listener); }, []);
  return { mounts, active };
}
