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
  onRestoreDefault,
  t,
}: {
  diagnostic: DesignModDiagnostic;
  phase: DesignModHostPhase;
  open: boolean;
  onToggle: () => void;
  onOpenPreferences: () => void;
  onRestoreDefault: () => void;
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
              <button type="button" className="design-mod-recovery__action" onClick={onRestoreDefault}>
                {t('designMod.hostRestoreDefault')}
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
    return () => presenters.setPaused(true);
  }, [presenters, runtimePaused]);

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
    publishDesignModDiagnostics({ diagnostic, attached, fps, activeSubscriptions: ledgerRef.current.size() });
  }, [attached, diagnostic, fps]);

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
      onRestoreDefault={commands.restoreDefault}
      t={t}
    />
  </div>;
}
