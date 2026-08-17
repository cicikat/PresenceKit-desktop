import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
  listDesignMods,
  loadDesignModPackage,
  restoreDefaultDesign,
  type ActivationContext,
} from '../../../shared/design-mod/runtime';
import { ComponentAttachmentRegistry } from '../../../shared/design-mod/components';
import { publishDesignModDiagnostics } from '../../../shared/design-mod/diagnostics';
import { clearDesignMounts, setDesignMount, setDesignRuntimeActive, subscribeDesignMounts } from '../../../shared/design-mod/mounts';
import type { SidebarPresenters } from '../../../shared/design-mod/presenters';
import { DesignAwareRegion } from '../../../shared/design-mod/regions';
import { getDesignModHostLayoutState, type DesignModHostPhase } from '../../../shared/design-mod/hostLayout';
import type { DesignModDiagnostic, DesignModRecord, DesignSurface } from '../../../shared/design-mod/types';
import { DesignSatelliteBridge, cropSatellitePresenterSnapshot, type DesignSatelliteBounds, type DesignSatelliteCommand, type DesignSatelliteDiagnostic } from '../../../shared/design-mod/satellite';

interface DesignModHostProps {
  engine: any;
  presenters: SidebarPresenters;
  toolStatus: any;
  isCovered: boolean;
  dreamActive: boolean;
  navigation: { groupView: string | null; sidebarTab: string; sidebarOpen: boolean };
  commands: {
    closeSidebar: () => void;
    setSidebarTab: (tab: string) => void;
    openPrefs: () => void;
    openAdminPanel: () => void;
    restoreDefault: () => void;
  };
  renderSidebar: (tab: 'flow' | 'garden' | 'diary' | 'status') => ReactNode;
  renderChat: ReactNode;
  children?: ReactNode;
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

function DesignModRecoveryOverlay({
  diagnostic,
  phase,
  open,
  onToggle,
  onOpenPreferences,
  onOpenAdminPanel,
  t,
}: {
  diagnostic: DesignModDiagnostic;
  phase: DesignModHostPhase;
  open: boolean;
  onToggle: () => void;
  onOpenPreferences: () => void;
  onOpenAdminPanel: () => void;
  t: (key: any) => string;
}) {
  const status = t('designMod.hostRecoveryHint').replace('{status}', diagnostic.message);
  return (
    <div className="design-mod-system-overlay" data-design-mod-system-overlay="true">
      <div className="design-mod-recovery" data-design-mod-needs-recovery={phase === 'builtin-default' ? 'false' : 'true'}>
        {open && (
          <div className="design-mod-recovery__panel" role="dialog" aria-label={t('designMod.hostMenu')}>
            <div className="design-mod-recovery__status">{status}</div>
            <div className="design-mod-recovery__actions">
              <button type="button" className="design-mod-recovery__action" onClick={onOpenPreferences}>
                {t('designMod.hostOpenPreferences')}
              </button>
              <button type="button" className="design-mod-recovery__action" onClick={onOpenAdminPanel}>
                {t('designMod.hostOpenAdminPanel')}
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className="design-mod-recovery__trigger"
          aria-label={t('designMod.hostMenu')}
          aria-expanded={open}
          title={t('designMod.hostMenu')}
          onClick={onToggle}
        >
          {open ? '×' : '⋯'}
        </button>
      </div>
    </div>
  );
}

export function DesignModHost({ engine, presenters, toolStatus, isCovered, dreamActive, navigation, commands, renderSidebar, renderChat, children }: DesignModHostProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(getSelectedDesignModId);
  const [diagnostic, setDiagnostic] = useState<DesignModDiagnostic>(formatDiagnostic('idle', 'builtin-default'));
  const [records, setRecords] = useState<DesignModRecord[]>([]);
  const [attached, setAttached] = useState<DesignComponentId[]>([]);
  const [surfaceDiagnostics, setSurfaceDiagnostics] = useState<DesignSatelliteDiagnostic[]>([]);
  const [active, setActive] = useState(false);
  const [fps, setFps] = useState(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
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
  const satelliteBridgeRef = useRef<DesignSatelliteBridge | null>(null);
  const navigationSnapshotRef = useRef(navigation);
  const navigationListenersRef = useRef(new Set<() => void>());
  const mountedRef = useRef(true);
  const activationRequestRef = useRef(0);
  const runtimePaused = isCovered || dreamActive || document.hidden;
  useViewportSignals(isCovered, runtimePaused);

  const hostPhase: DesignModHostPhase = selectedId === 'builtin-default'
    ? 'builtin-default'
    : active
      ? 'active'
      : diagnostic.phase === 'error'
        ? 'error'
        : diagnostic.phase === 'activating' ? 'activating' : 'loading';
  const hostLayout = getDesignModHostLayoutState(hostPhase);

  useEffect(() => {
    presenters.setPaused(runtimePaused);
    void satelliteBridgeRef.current?.api.setVisible(!runtimePaused).catch(error => console.warn('[design-satellite] 可见性同步失败:', error));
    return () => presenters.setPaused(true);
  }, [presenters, runtimePaused]);

  useEffect(() => {
    const syncSatelliteVisibility = () => {
      void satelliteBridgeRef.current?.api.setVisible(!document.hidden && !isCovered && !dreamActive)
        .catch(error => console.warn('[design-satellite] 页面可见性同步失败:', error));
    };
    document.addEventListener('visibilitychange', syncSatelliteVisibility);
    syncSatelliteVisibility();
    return () => document.removeEventListener('visibilitychange', syncSatelliteVisibility);
  }, [isCovered, dreamActive]);

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
    void satelliteBridgeRef.current?.api.destroy().catch(error => console.warn('[design-satellite] 销毁失败:', error));
    satelliteBridgeRef.current = null;
    setSurfaceDiagnostics([]);
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
    const requestId = activationRequestRef.current + 1;
    activationRequestRef.current = requestId;
    cleanupRuntime();
    setSelectedId(requestedId);
    const isCurrentRequest = () => mountedRef.current && activationRequestRef.current === requestId;
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
      if (!isCurrentRequest()) return;
      applyDesignModPackage(pkg);
      if (pkg.styleText) {
        const style = document.createElement('style');
        style.dataset.designModStyle = pkg.manifest.id;
        style.textContent = pkg.styleText;
        document.head.appendChild(style);
        styleRef.current = style;
      }
      const imported = importDesignMod(pkg.entrySource);
      let module: { activate?: unknown };
      try {
        module = await imported.modulePromise;
      } catch (error) {
        imported.revoke();
        throw error;
      }
      if (!isCurrentRequest()) {
        imported.revoke();
        return;
      }
      blobRevokeRef.current = imported.revoke;
      if (typeof module.activate !== 'function') throw new Error('entry.js 必须导出 activate(host)');
      const phaseActivating = formatDiagnostic('activating', t('designMod.activating'));
      setDiagnostic(phaseActivating); publishDesignModDiagnostics({ diagnostic: phaseActivating });
      const surface: DesignSurface = 'main';
      const componentLayer = componentLayerRef.current;
      const underlay = underlayRef.current;
      const overlay = overlayRef.current;
      if (!componentLayer || !underlay || !overlay) throw new Error('设计舞台尚未就绪');
      const satelliteBridge = pkg.nativeSurfacePackages.length > 0
        ? new DesignSatelliteBridge(
          pkg.manifest.id,
          requestId,
          pkg.nativeSurfacePackages,
          async (surfaceId, sequence) => {
            const currentWindow = getCurrentWindow();
            const [position, size, dpi, visible, focused, maximized] = await Promise.all([
              currentWindow.outerPosition().catch(() => ({ x: 0, y: 0 })),
              currentWindow.outerSize().catch(() => ({ width: Math.round(window.innerWidth * (window.devicePixelRatio || 1)), height: Math.round(window.innerHeight * (window.devicePixelRatio || 1)) })),
              currentWindow.scaleFactor().catch(() => window.devicePixelRatio || 1),
              currentWindow.isVisible().catch(() => !document.hidden),
              currentWindow.isFocused().catch(() => document.hasFocus()),
              currentWindow.isMaximized().catch(() => false),
            ]);
            geometryRef.current.flush();
            const mainBounds: DesignSatelliteBounds = { x: position.x, y: position.y, width: size.width, height: size.height, dpi };
            const anchors = Object.fromEntries(attachmentsRef.current.list().map(id => {
              const geometry = geometryRef.current.get(id);
              if (!geometry) return [id, { x: 0, y: 0, width: 0, height: 0, visible: false }];
              return [id, {
                x: mainBounds.x + Math.round(geometry.rect.left * dpi),
                y: mainBounds.y + Math.round(geometry.rect.top * dpi),
                width: Math.round(geometry.rect.width * dpi),
                height: Math.round(geometry.rect.height * dpi),
                visible: geometry.visible,
              }];
            }));
            return {
              schemaVersion: 1 as const,
              sequence,
              generation: requestId,
              modId: pkg.manifest.id,
              surfaceId,
              updatedAt: Date.now(),
              main: { bounds: mainBounds, visible, focused, maximized },
              window: { visible, focused, covered: isCovered, paused: runtimePaused },
              pointer: pointerStore.get(),
              theme: { id: getCurrentThemeId(), ...getDayNight() },
              state: cropSatellitePresenterSnapshot(engine.get()),
              chat: cropSatellitePresenterSnapshot(chatSessionMetrics.get()),
              navigation: cropSatellitePresenterSnapshot(navigationSnapshotRef.current),
              presenters: { status: cropSatellitePresenterSnapshot(presenters.status.get()), flow: cropSatellitePresenterSnapshot(presenters.flow.get()) },
              anchors,
            };
          },
          async (command: DesignSatelliteCommand) => {
            const params = command.params && typeof command.params === 'object' ? command.params as Record<string, unknown> : {};
            switch (command.command) {
              case 'closeSidebar': commands.closeSidebar(); break;
              case 'setSidebarTab': commands.setSidebarTab(String(params.tab ?? 'flow')); break;
              case 'openPreferences': commands.openPrefs(); break;
              case 'restoreDefaultDesign': commands.restoreDefault(); break;
              case 'retryMood': presenters.status.commands.retryMood(); break;
              case 'retryActivity': presenters.status.commands.retryActivity(); break;
              case 'retrySensor': presenters.status.commands.retrySensor(); break;
              case 'refreshFlow': presenters.flow.commands.refresh(); break;
              case 'refreshGarden': presenters.garden.commands.refresh(); break;
              case 'refreshDiary': presenters.diary.commands.refresh(); break;
              case 'selectDiaryCharacter': presenters.diary.commands.selectCharacter(String(params.characterId ?? '')); break;
              case 'openDiaryEntry': await presenters.diary.commands.openEntry(String(params.entryId ?? '')); break;
              default: throw new Error(`未注册的设计卫星命令: ${command.command}`);
            }
          },
        )
        : null;
      satelliteBridgeRef.current = satelliteBridge;
      if (satelliteBridge) {
        const unsubscribe = satelliteBridge.api.subscribe(() => setSurfaceDiagnostics([...satelliteBridge.api.get()]));
        ledgerRef.current.add(unsubscribe);
        await satelliteBridge.start();
        setSurfaceDiagnostics([...satelliteBridge.api.get()]);
        await satelliteBridge.api.setVisible(!runtimePaused);
      }
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
      const presenterApi = (presenter: SidebarPresenters[keyof Pick<SidebarPresenters, 'status' | 'flow' | 'garden' | 'diary'>], name: string) => ({
        schemaVersion: presenter.schemaVersion,
        get: () => presenter.get(),
        subscribe: (listener: () => void) => {
          const unsubscribe = presenter.subscribe(listener);
          let active = true;
          const remove = ledgerRef.current.add(() => { if (active) { active = false; unsubscribe(); } });
          return () => { if (!active) return; active = false; unsubscribe(); remove(); };
        },
        commands: presenter.commands,
        acquire: (consumerId: string) => {
          const release = presenter.acquire(`mod:${pkg.manifest.id}:${name}:${consumerId}`);
          let active = true;
          const remove = ledgerRef.current.add(() => { if (active) { active = false; release(); } });
          return () => { if (!active) return; active = false; release(); remove(); };
        },
        getDiagnostics: () => presenter.getDiagnostics(),
        subscribeDiagnostics: (listener: () => void) => presenter.subscribeDiagnostics(listener),
        setPaused: (paused: boolean) => presenter.setPaused(paused),
      });
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
        presenters: {
          status: presenterApi(presenters.status, 'status'),
          flow: presenterApi(presenters.flow, 'flow'),
          garden: presenterApi(presenters.garden, 'garden'),
          diary: presenterApi(presenters.diary, 'diary'),
        },
        geometry: {
          get: (id: DesignComponentId) => { geometryRef.current.flush(); return geometryRef.current.get(id); },
          observe: (id: DesignComponentId, listener: (value: unknown) => void) => geometryRef.current.observe(id, listener as never),
          flush: () => geometryRef.current.flush(),
        },
        commands: {
          closeSidebar: commands.closeSidebar,
          setSidebarTab: commands.setSidebarTab,
          openPreferences: commands.openPrefs,
          restoreDefaultDesign: commands.restoreDefault,
        },
        surfaces: satelliteBridge?.api ?? {
          get: () => [],
          subscribe: () => () => {},
          setVisible: async () => {},
          updateBounds: async () => {},
          destroy: async () => {},
        },
        assets: { url: (path: string) => designModReadApi.assetUrl(pkg.assetRootId, `assets/${path.replace(/^assets\//, '')}`, url => ledgerRef.current.add(() => URL.revokeObjectURL(url))) },
        diagnostics: { add: (message: string) => setDiagnostic(formatDiagnostic('active', message)) },
      };
      const ok = await lifecycleRef.current.activate(context => (module.activate as (host: any, context?: ActivationContext) => void | (() => void) | Promise<void | (() => void)>)(host, context), error => {
        const next = formatDiagnostic('error', t('designMod.fallback'), error);
        setDiagnostic(next); publishDesignModDiagnostics({ diagnostic: next });
      });
      if (!ok) throw new Error('设计 Mod activate 未完成');
      if (isCurrentRequest()) {
        const next = formatDiagnostic('active', t('designMod.active'));
        setDiagnostic(next); setActive(true); setDesignRuntimeActive(true); publishDesignModDiagnostics({ diagnostic: next, attached: attachmentsRef.current.list() });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      cleanupRuntime();
      const next = formatDiagnostic('error', t('designMod.fallback'), error);
      setDiagnostic(next); publishDesignModDiagnostics({ diagnostic: next });
    }
  }, [cleanupRuntime, engine, navigation, presenters, records, t, commands]);

  useEffect(() => {
    // React StrictMode runs effect cleanup/setup once during development. The
    // cleanup must not leave the async activation path permanently marked as
    // unmounted, otherwise portal mounts move into the hidden layer while the
    // host never switches to active.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRuntime();
      clearDesignMounts();
    };
  }, [cleanupRuntime]);
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
    publishDesignModDiagnostics({ diagnostic, attached, fps, activeSubscriptions: ledgerRef.current.size(), surfaces: surfaceDiagnostics });
  }, [attached, diagnostic, fps, surfaceDiagnostics]);

  useEffect(() => {
    const publishHostDiagnostics = () => {
      const viewport = viewportStore.get();
      publishDesignModDiagnostics({
        host: {
          phase: hostPhase,
          defaultShellVisible: hostLayout.defaultShellVisible,
          modLayerVisible: hostLayout.modLayerVisible,
          attached,
          viewport: {
            width: viewport.width,
            height: viewport.height,
            devicePixelRatio: viewport.devicePixelRatio,
          },
          recoveryEntry: {
            visible: true,
            open: recoveryOpen,
            canOpenPreferences: true,
            canRestoreDefault: true,
          },
        },
      });
    };
    publishHostDiagnostics();
    const unsubscribe = viewportStore.subscribe(publishHostDiagnostics);
    return () => { unsubscribe(); };
  }, [attached, hostLayout.defaultShellVisible, hostLayout.modLayerVisible, hostPhase, recoveryOpen]);

  useEffect(() => {
    const publishPresenterDiagnostics = () => publishDesignModDiagnostics({ presenters: presenters.getDiagnostics() });
    publishPresenterDiagnostics();
    return presenters.subscribeDiagnostics(publishPresenterDiagnostics);
  }, [presenters]);

  const layers = (
    <div ref={layerRef} className="design-mod-host" data-design-mod={selectedId} data-trusted-design-mod="true" data-surface="main" data-design-mod-layer-visible={hostLayout.modLayerVisible ? 'true' : 'false'} style={{ display: hostLayout.modLayerVisible ? undefined : 'none' }}>
      <div ref={underlayRef} className="design-mod-layer design-mod-underlay" />
      <div ref={componentLayerRef} className="design-mod-layer design-mod-components" />
      <div ref={overlayRef} className="design-mod-layer design-mod-overlay" />
      {children}
    </div>
  );

  // The normal layout stays mounted so ChatPanel keeps its history, draft and WS owner.
  // DesignAwareRegion portals its already-created React nodes into Mod-owned mounts.
  return <div
    className="design-mod-host-root"
    data-design-mod-host-phase={hostPhase}
    data-design-mod-default-shell-visible={hostLayout.defaultShellVisible ? 'true' : 'false'}
    data-design-mod-layer-visible={hostLayout.modLayerVisible ? 'true' : 'false'}
  >
    <div className="design-mod-default-shell" data-design-mod-default-shell={hostLayout.defaultShellVisible ? 'visible' : 'hidden'}>{renderChat}</div>
    {layers}
    {hostLayout.modLayerVisible && <>
      {(['flow', 'garden', 'diary', 'status'] as const).map(tab => (
        <DesignAwareRegion key={tab} id={`chat.sidebar.${tab}`} fallback={false}>
          <div className="design-mod-sidebar-capability">{renderSidebar(tab)}</div>
        </DesignAwareRegion>
      ))}
    </>}
    <DesignModRecoveryOverlay
      diagnostic={diagnostic}
      phase={hostPhase}
      open={recoveryOpen}
      onToggle={() => setRecoveryOpen(value => !value)}
      onOpenPreferences={commands.openPrefs}
      onOpenAdminPanel={commands.openAdminPanel}
      t={t}
    />
  </div>;
}
