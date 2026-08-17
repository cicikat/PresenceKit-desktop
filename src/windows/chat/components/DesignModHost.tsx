import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../../../shared/i18n';
import { getCurrentThemeId, getDayNight, subscribe as subscribeTheme } from '../../../shared/theme/registry';
import { chatSessionMetrics } from '../../../shared/design-mod/metrics';
import { GeometryRegistry } from '../../../shared/design-mod/geometry';
import { nativeMotionStore, pointerStore, viewportStore, listenNativeWindowMotion } from '../../../shared/design-mod/signals';
import { DESIGN_COMPONENT_IDS, type DesignComponentId } from '../../../shared/design-mod/contract';
import {
  applyDesignModPackage,
  createDesignModHostLedger,
  DesignModLifecycle,
  designModReadApi,
  formatDiagnostic,
  getSelectedDesignModId,
  importDesignMod,
  invalidateDesignModCache,
  listDesignMods,
  loadDesignModPackage,
  restoreDefaultDesign,
  setSelectedDesignModId,
  type ActivationContext,
} from '../../../shared/design-mod/runtime';
import { ComponentAttachmentRegistry } from '../../../shared/design-mod/components';
import { publishDesignModDiagnostics } from '../../../shared/design-mod/diagnostics';
import { clearDesignMounts, setDesignMount, setDesignRuntimeActive, subscribeDesignMounts, useDesignMounts } from '../../../shared/design-mod/mounts';
import type { DesignModDiagnostic, DesignModRecord, DesignSurface } from '../../../shared/design-mod/types';

interface DesignModHostProps {
  engine: any;
  toolStatus: any;
  isCovered: boolean;
  dreamActive: boolean;
  navigation: { groupView: string | null; sidebarTab: string; sidebarOpen: boolean };
  commands: {
    closeSidebar: () => void;
    setSidebarTab: (tab: string) => void;
    openPrefs: () => void;
    restoreDefault: () => void;
  };
  renderSidebar: (tab: 'flow' | 'garden' | 'diary' | 'status') => ReactNode;
  renderChat: ReactNode;
  children?: ReactNode;
}

export function DesignAwareRegion({ id, children, fallback = true }: { id: DesignComponentId; children: ReactNode; fallback?: boolean }) {
  const { mounts } = useDesignMounts();
  const target = mounts[id];
  return target ? createPortal(children, target, `design-${id}`) : fallback ? <>{children}</> : null;
}

function useViewportSignals(isCovered: boolean, paused: boolean) {
  useEffect(() => {
    const update = () => viewportStore.update({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      visible: !document.hidden,
      covered: isCovered,
      paused,
    });
    update();
    window.addEventListener('resize', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.removeEventListener('resize', update); document.removeEventListener('visibilitychange', update); };
  }, [isCovered, paused]);
}

export function DesignModHost({ engine, toolStatus, isCovered, dreamActive, navigation, commands, renderSidebar, renderChat, children }: DesignModHostProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(getSelectedDesignModId);
  const [diagnostic, setDiagnostic] = useState<DesignModDiagnostic>(formatDiagnostic('idle', 'builtin-default'));
  const [records, setRecords] = useState<DesignModRecord[]>([]);
  const [attached, setAttached] = useState<DesignComponentId[]>([]);
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(0);
  const lifecycleRef = useRef(new DesignModLifecycle());
  const ledgerRef = useRef(createDesignModHostLedger());
  const attachmentsRef = useRef(new ComponentAttachmentRegistry());
  const geometryRef = useRef(new GeometryRegistry());
  const layerRef = useRef<HTMLDivElement>(null);
  const underlayRef = useRef<HTMLDivElement>(null);
  const componentLayerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const blobRevokeRef = useRef<(() => void) | null>(null);
  const navigationSnapshotRef = useRef(navigation);
  const navigationListenersRef = useRef(new Set<() => void>());
  const runtimePaused = isCovered || dreamActive || document.hidden;
  useViewportSignals(isCovered, runtimePaused);

  useEffect(() => {
    navigationSnapshotRef.current = navigation;
    navigationListenersRef.current.forEach(listener => listener());
  }, [navigation]);

  useEffect(() => {
    const move = (event: PointerEvent) => pointerStore.update({ x: event.clientX, y: event.clientY, buttons: event.buttons, dragging: event.buttons !== 0 });
    const down = (event: PointerEvent) => pointerStore.update({ x: event.clientX, y: event.clientY, buttons: event.buttons || 1, pressed: true, dragging: true });
    const up = (event: PointerEvent) => pointerStore.update({ x: event.clientX, y: event.clientY, buttons: event.buttons, pressed: false, dragging: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void listDesignMods().then(values => { if (mounted) { setRecords(values); publishDesignModDiagnostics({ available: values }); } }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const unlisten = subscribeDesignMounts(() => setAttached(attachmentsRef.current.list()));
    return unlisten;
  }, []);

  useEffect(() => {
    const invalidateGeometry = () => geometryRef.current.markAllDirty();
    window.addEventListener('resize', invalidateGeometry);
    window.addEventListener('scroll', invalidateGeometry, true);
    return () => {
      window.removeEventListener('resize', invalidateGeometry);
      window.removeEventListener('scroll', invalidateGeometry, true);
    };
  }, []);

  const cleanupRuntime = useCallback(() => {
    lifecycleRef.current.dispose();
    ledgerRef.current.clear();
    attachmentsRef.current.clear();
    for (const id of DESIGN_COMPONENT_IDS) setDesignMount(id, null);
    setAttached([]);
    setActive(false);
    setDesignRuntimeActive(false);
    blobRevokeRef.current?.();
    blobRevokeRef.current = null;
    styleRef.current?.remove();
    styleRef.current = null;
    underlayRef.current?.replaceChildren();
    componentLayerRef.current?.replaceChildren();
    overlayRef.current?.replaceChildren();
    restoreDefaultDesign();
  }, []);

  const activate = useCallback(async (requestedId: string) => {
    cleanupRuntime();
    setSelectedId(requestedId);
    if (requestedId === 'builtin-default') {
      setDiagnostic(formatDiagnostic('idle', t('designMod.default')));
      publishDesignModDiagnostics({ manifest: null, diagnostic: formatDiagnostic('idle', 'builtin-default'), attached: [] });
      return;
    }
    const record = records.find(candidate => candidate.manifest.id === requestedId);
    if (!record) {
      const next = formatDiagnostic('error', t('designMod.fallback'), `找不到 ${requestedId}`);
      setDiagnostic(next); publishDesignModDiagnostics({ diagnostic: next });
      return;
    }
    const phase = formatDiagnostic('loading', t('designMod.loading'));
    setDiagnostic(phase); publishDesignModDiagnostics({ manifest: record.manifest, diagnostic: phase });
    try {
      const pkg = await loadDesignModPackage(record);
      applyDesignModPackage(pkg);
      if (pkg.styleText) {
        const style = document.createElement('style');
        style.dataset.designModStyle = pkg.manifest.id;
        style.textContent = pkg.styleText;
        document.head.appendChild(style);
        styleRef.current = style;
      }
      const imported = importDesignMod(pkg.entrySource);
      blobRevokeRef.current = imported.revoke;
      const module = await imported.modulePromise;
      if (typeof module.activate !== 'function') throw new Error('entry.js 必须导出 activate(host)');
      const phaseActivating = formatDiagnostic('activating', t('designMod.activating'));
      setDiagnostic(phaseActivating); publishDesignModDiagnostics({ diagnostic: phaseActivating });
      const surface: DesignSurface = 'main';
      const componentLayer = componentLayerRef.current;
      const underlay = underlayRef.current;
      const overlay = overlayRef.current;
      if (!componentLayer || !underlay || !overlay) throw new Error('设计舞台尚未就绪');
      const geometryCleanups = new Map<DesignComponentId, () => void>();
      const componentApi = {
        attach: (id: DesignComponentId, mount: HTMLElement) => {
          const attachment = attachmentsRef.current.attach(id, mount);
          setDesignMount(id, mount);
          const unregisterGeometry = geometryRef.current.register(id, mount);
          const removeGeometryLedger = ledgerRef.current.add(unregisterGeometry);
          geometryCleanups.set(id, () => { unregisterGeometry(); removeGeometryLedger(); });
          setAttached(attachmentsRef.current.list());
          return attachment;
        },
        detach: (id: DesignComponentId) => {
          const didDetach = attachmentsRef.current.detach(id);
          if (didDetach) {
            geometryCleanups.get(id)?.();
            geometryCleanups.delete(id);
            setDesignMount(id, null);
            setAttached(attachmentsRef.current.list());
          }
          return didDetach;
        },
        list: () => attachmentsRef.current.list(),
      };
      const signals = {
        state: { get: () => engine.get(), subscribe: engine.subscribe.bind(engine) },
        chat: { get: chatSessionMetrics.get, subscribe: chatSessionMetrics.subscribe },
        navigation: {
          get: () => navigationSnapshotRef.current,
          subscribe: (listener: () => void) => {
            navigationListenersRef.current.add(listener);
            return () => navigationListenersRef.current.delete(listener);
          },
        },
        theme: { get: () => ({ id: getCurrentThemeId(), ...getDayNight(), tokens: Object.fromEntries(Array.from({ length: document.documentElement.style.length }, (_, i) => { const key = document.documentElement.style.item(i); return [key, document.documentElement.style.getPropertyValue(key)]; })) }), subscribe: subscribeTheme },
        viewport: { get: viewportStore.get, subscribe: viewportStore.subscribe },
        pointer: { get: pointerStore.get, subscribe: pointerStore.subscribe },
        nativeWindow: { get: nativeMotionStore.get, subscribe: nativeMotionStore.subscribe },
      };
      const host = {
        version: 1,
        trust: 'trusted-local-code' as const,
        surface,
        manifest: pkg.manifest,
        signals,
        root: layerRef.current,
        layers: { underlay, components: componentLayer, overlay },
        components: componentApi,
        geometry: {
          get: (id: DesignComponentId) => { geometryRef.current.flush(); return geometryRef.current.get(id); },
          observe: (id: DesignComponentId, listener: (value: unknown) => void) => geometryRef.current.observe(id, listener as never),
          flush: () => geometryRef.current.flush(),
        },
        commands: {
          closeSidebar: commands.closeSidebar,
          setSidebarTab: commands.setSidebarTab,
          openPreferences: commands.openPrefs,
          restoreDefaultDesign: () => { setSelectedDesignModId('builtin-default'); commands.restoreDefault(); void activate('builtin-default'); },
        },
        assets: { url: (path: string) => designModReadApi.assetUrl(pkg.assetRootId, `assets/${path.replace(/^assets\//, '')}`, url => ledgerRef.current.add(() => URL.revokeObjectURL(url))) },
        diagnostics: { add: (message: string) => setDiagnostic(formatDiagnostic('active', message)) },
      };
      const ok = await lifecycleRef.current.activate(context => (module.activate as (host: any, context?: ActivationContext) => void | (() => void) | Promise<void | (() => void)>)(host, context), error => {
        const next = formatDiagnostic('error', t('designMod.fallback'), error);
        setDiagnostic(next); publishDesignModDiagnostics({ diagnostic: next });
      });
      if (!ok) throw new Error('设计 Mod activate 未完成');
      if (mountedRef.current) {
        const next = formatDiagnostic('active', t('designMod.active'));
        setDiagnostic(next); setActive(true); setDesignRuntimeActive(true); publishDesignModDiagnostics({ diagnostic: next, attached: attachmentsRef.current.list() });
      }
    } catch (error) {
      cleanupRuntime();
      const next = formatDiagnostic('error', t('designMod.fallback'), error);
      setDiagnostic(next); publishDesignModDiagnostics({ diagnostic: next });
    }
  }, [cleanupRuntime, engine, navigation, records, t, commands]);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; cleanupRuntime(); clearDesignMounts(); }, [cleanupRuntime]);
  const activateRef = useRef(activate);
  useEffect(() => { activateRef.current = activate; }, [activate]);
  useEffect(() => {
    if (!records.length) return;
    void activateRef.current(getSelectedDesignModId());
    const listener = (event: Event) => {
      const key = (event as CustomEvent<{ key: string }>).detail?.key;
      if (key === 'chat.designMod') void activateRef.current(getSelectedDesignModId());
      if (key === 'chat.designMod.refresh') {
        void listDesignMods(true).then(values => {
          setRecords(values);
          publishDesignModDiagnostics({ available: values });
          void activateRef.current(getSelectedDesignModId());
        }).catch(() => {});
      }
    };
    window.addEventListener('emerald-ui-pref-change', listener);
    return () => window.removeEventListener('emerald-ui-pref-change', listener);
  }, [records.length]);

  useEffect(() => {
    if (runtimePaused) return;
    let frame = 0;
    let frames = 0;
    let startedAt = performance.now();
    const tick = (now: number) => {
      frames += 1;
      geometryRef.current.flush();
      if (now - startedAt >= 1000) { setFps(Math.round(frames * 1000 / (now - startedAt))); frames = 0; startedAt = now; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const abort = new AbortController();
    void listenNativeWindowMotion(abort.signal).catch(() => {});
    return () => { cancelAnimationFrame(frame); abort.abort(); };
  }, [runtimePaused]);

  useEffect(() => {
    publishDesignModDiagnostics({ diagnostic, attached, fps, activeSubscriptions: ledgerRef.current.size() });
  }, [attached, diagnostic, fps]);

  const layers = (
    <div ref={layerRef} className="design-mod-host" data-design-mod={selectedId} data-trusted-design-mod="true" data-surface="main" style={{ display: active ? undefined : 'none' }}>
      <div ref={underlayRef} className="design-mod-layer design-mod-underlay" />
      <div ref={componentLayerRef} className="design-mod-layer design-mod-components" />
      <div ref={overlayRef} className="design-mod-layer design-mod-overlay" />
      {children}
    </div>
  );

  // The normal layout stays mounted so ChatPanel keeps its history, draft and WS owner.
  // DesignAwareRegion portals its already-created React nodes into Mod-owned mounts.
  return <>
    <div data-design-mod-default-shell={!active} style={active ? { position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' } : undefined}>{renderChat}</div>
    {layers}
    {active && <>
      {(['flow', 'garden', 'diary', 'status'] as const).map(tab => (
        <DesignAwareRegion key={tab} id={`chat.sidebar.${tab}`} fallback={false}>
          <div className="design-mod-sidebar-capability">{renderSidebar(tab)}</div>
        </DesignAwareRegion>
      ))}
    </>}
  </>;
}
