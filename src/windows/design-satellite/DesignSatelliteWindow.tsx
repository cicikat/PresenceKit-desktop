import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DESIGN_SATELLITE_ACK_EVENT, DESIGN_SATELLITE_SNAPSHOT_EVENT, isFreshSatelliteSnapshot, type DesignSatelliteCommandAck, type DesignSatelliteSnapshot } from '../../shared/design-mod/satellite';
import { createObjectUrlFromBase64 } from '../../shared/design-mod/disposer';
import { createResourceDisposer } from '../../shared/design-mod/disposer';
import './DesignSatelliteWindow.css';

const params = new URLSearchParams(window.location.search);
const MOD_ID = params.get('mod_id') ?? '';
const SURFACE_ID = params.get('surface') ?? '';
const GENERATION = Number(params.get('generation') ?? '0');
const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

interface SurfaceManifest {
  id: string;
  entry: string;
  style?: string;
}

interface SurfaceEntryModule {
  activate?: (host: unknown) => void | (() => void) | Promise<void | (() => void)>;
}

interface DesignModAssetResponse { mime: string; base64: string; }

function isSafePath(value: unknown, extension: string): value is string {
  return typeof value === 'string' && value.length > 0 && value.endsWith(extension)
    && !value.startsWith('/') && !value.includes('\\')
    && value.split('/').every(part => part && part !== '.' && part !== '..');
}

async function readDesignFile(file: string): Promise<string> {
  try {
    return await invoke<string>('read_design_mod_file', { id: MOD_ID, file });
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    const response = await fetch(`/design-mods/${encodeURIComponent(MOD_ID)}/${file}`);
    if (!response.ok) throw new Error(`设计卫星资源读取失败 HTTP ${response.status}`);
    return response.text();
  }
}

function isSafeAssetPath(file: string): boolean {
  return file.startsWith('assets/') && file.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes('\\'));
}

async function readDesignAsset(file: string): Promise<DesignModAssetResponse> {
  if (!isSafeAssetPath(file)) throw new Error('设计卫星资源路径必须位于当前 Mod 的 assets/ 内');
  try {
    return await invoke<DesignModAssetResponse>('read_design_mod_asset', { id: MOD_ID, file });
  } catch (error) {
    if (!import.meta.env.DEV) throw error;
    // Browser fallback is still a URL. Never return binary/text content to DOM src.
    return { mime: 'application/octet-stream', base64: '' };
  }
}

function createSignal<T>(initial: T) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: T) { current = next; listeners.forEach(listener => listener()); },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function DesignSatelliteWindow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const underlayRef = useRef<HTMLDivElement>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DesignSatelliteSnapshot | null>(null);
  const snapshotRef = useRef<DesignSatelliteSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    const resources = createResourceDisposer();
    let disposeEntry: (() => void) | undefined;
    const signal = createSignal<DesignSatelliteSnapshot | null>(null);
    const pending = new Map<string, { resolve: (ack: DesignSatelliteCommandAck) => void; reject: (error: Error) => void; timer: number; remove: () => void; settle: () => void }>();
    const invalidated = () => disposed || resources.disposed;
    const rejectPending = (error: Error) => {
      for (const item of [...pending.values()]) { window.clearTimeout(item.timer); item.remove(); item.reject(error); }
      pending.clear();
    };

    const request = async (command: string, commandParams: unknown = {}) => {
      if (invalidated || !SAFE_ID.test(SURFACE_ID) || GENERATION < 1) throw new Error('设计卫星已销毁');
      const correlationId = `${SURFACE_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ack = new Promise<DesignSatelliteCommandAck>((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          const item = pending.get(correlationId);
          settled = true;
          item?.remove();
          pending.delete(correlationId);
          reject(new Error('设计卫星命令超时'));
        }, 3000);
        const remove = resources.add(() => {
          window.clearTimeout(timer);
          pending.delete(correlationId);
          if (!settled) { settled = true; reject(new Error('设计卫星已销毁')); }
        });
        pending.set(correlationId, { resolve, reject, timer, remove, settle: () => { settled = true; } });
      });
      try {
        await invoke('design_satellite_command', {
          generation: GENERATION,
          surfaceId: SURFACE_ID,
          command,
          params: commandParams,
          correlationId,
          label: getCurrentWindow().label,
        });
      } catch (error) {
        const item = pending.get(correlationId);
        item?.settle();
        item?.remove();
        pending.delete(correlationId);
        item?.reject(error instanceof Error ? error : new Error(String(error)));
        await ack.catch(() => {});
        throw error instanceof Error ? error : new Error(String(error));
      }
      const result = await ack;
      if (!result.ok) throw new Error(result.error ?? '设计卫星命令失败');
      return result;
    };

    const run = async () => {
      if (!SAFE_ID.test(MOD_ID) || !SAFE_ID.test(SURFACE_ID) || !Number.isSafeInteger(GENERATION) || GENERATION < 1) throw new Error('设计卫星 URL 参数无效');
      const stopSnapshot = await listen<DesignSatelliteSnapshot>(DESIGN_SATELLITE_SNAPSHOT_EVENT, event => {
        const next = event.payload;
        if (!isFreshSatelliteSnapshot(snapshotRef.current, next, GENERATION, SURFACE_ID)) return;
        snapshotRef.current = next;
        signal.set(next);
        setSnapshot(next);
      });
      resources.add(stopSnapshot);
      if (invalidated()) return;
      void listen<DesignSatelliteCommandAck>(DESIGN_SATELLITE_ACK_EVENT, event => {
        const ack = event.payload;
        const item = pending.get(ack.correlationId);
        if (!item || ack.generation !== GENERATION || ack.surfaceId !== SURFACE_ID) return;
        window.clearTimeout(item.timer);
        pending.delete(ack.correlationId);
        item.settle();
        item.remove();
        item.resolve(ack);
      }).then(stopAck => {
        if (invalidated()) stopAck();
        else resources.add(stopAck);
      }).catch(nextError => {
        if (!invalidated()) setError(nextError instanceof Error ? nextError.message : String(nextError));
      });

      const manifest = JSON.parse(await readDesignFile('mod.json')) as { nativeSurfaces?: SurfaceManifest[] };
      if (invalidated()) return;
      const surface = manifest.nativeSurfaces?.find(candidate => candidate.id === SURFACE_ID);
      if (!surface || !isSafePath(surface.entry, '.js') || (surface.style !== undefined && !isSafePath(surface.style, '.css'))) throw new Error('设计卫星 manifest 不包含安全资源');
      const styleText = surface.style ? await readDesignFile(surface.style) : '';
      if (invalidated()) return;
      if (styleText) {
        const style = document.createElement('style');
        style.dataset.designSatelliteStyle = SURFACE_ID;
        style.textContent = styleText;
        document.head.appendChild(style);
        resources.add(() => style.remove());
      }
      const entrySource = await readDesignFile(surface.entry);
      if (invalidated()) return;
      if (/^\s*import\s+|\bimport\s*\(/m.test(entrySource)) throw new Error('设计卫星 entry.js 不得包含裸 import');
      const entryUrl = URL.createObjectURL(new Blob([entrySource], { type: 'text/javascript' }));
      resources.add(() => URL.revokeObjectURL(entryUrl));
      const module = await import(/* @vite-ignore */ entryUrl) as SurfaceEntryModule;
      if (invalidated()) return;
      if (typeof module.activate !== 'function') throw new Error('设计卫星 entry.js 必须导出 activate(host)');
      if (!rootRef.current || !underlayRef.current || !componentRef.current || !overlayRef.current) throw new Error('设计卫星舞台尚未就绪');
      const host = {
        version: 1,
        trust: 'trusted-local-code' as const,
        surface: 'satellite' as const,
        surfaceId: SURFACE_ID,
        generation: GENERATION,
        root: rootRef.current,
        layers: { underlay: underlayRef.current, components: componentRef.current, overlay: overlayRef.current },
        snapshot: { get: signal.get, subscribe: signal.subscribe },
        signals: { snapshot: { get: signal.get, subscribe: signal.subscribe } },
        commands: { request },
        assets: { url: async (path: string) => {
          const relative = path.replace(/^\/+/, '').replace(/^assets\//, '');
          const asset = await readDesignAsset(`assets/${relative}`);
          if (asset.base64) return createObjectUrlFromBase64(asset, url => resources.add(() => URL.revokeObjectURL(url)));
          if (!import.meta.env.DEV) throw new Error('设计卫星资源为空');
          return `/design-mods/${encodeURIComponent(MOD_ID)}/assets/${relative}`;
        } },
      };
      const cleanup = await module.activate(host);
      if (invalidated()) { if (typeof cleanup === 'function') cleanup(); return; }
      if (typeof cleanup === 'function') disposeEntry = cleanup;
      await invoke('design_satellite_ready', { generation: GENERATION, surfaceId: SURFACE_ID, label: getCurrentWindow().label });
      if (invalidated()) return;
    };
    void run().catch(nextError => {
      if (!disposed) setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
    return () => {
      disposed = true;
      rejectPending(new Error('设计卫星已销毁'));
      try { disposeEntry?.(); } finally {
        disposeEntry = undefined;
        resources.dispose();
      }
    };
  }, []);

  return (
    <main ref={rootRef} className="design-satellite-root" data-design-satellite={SURFACE_ID} data-design-satellite-generation={GENERATION}>
      <div ref={underlayRef} className="design-satellite-layer design-satellite-underlay" />
      <div ref={componentRef} className="design-satellite-layer design-satellite-components" />
      <div ref={overlayRef} className="design-satellite-layer design-satellite-overlay" />
      {error && <div className="design-satellite-error" role="alert">{error}</div>}
      {!error && !snapshot && <div className="design-satellite-loading" aria-hidden="true" />}
    </main>
  );
}
