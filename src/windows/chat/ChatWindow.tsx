import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StateEngine } from '../../shared/state/store';
import { useBackendStatePolling } from '../../shared/state/useBackendStatePolling';
import { avatarStore } from '../../shared/avatars/store';
import { refreshActiveCharacterInfo, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { getCharacterAvatar, getPromptAssets } from '../../shared/api/backend';
import { wsClient } from '../../shared/api/ws';
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import { isPresenceNagEnabled, patchPresenceNagEnabled } from '../../shared/presenceNag';
import { getProactiveGapHours, patchProactiveGapHours } from '../../shared/proactiveGap';
import { isPlayModeEnabled, setPlayModeEnabled } from '../../shared/playMode';
import { publishPetSnapshot, setPetWindowVisible, startPetSnapshotResponder, emitPetPrefs, emitPetTurn } from '../../shared/pet/bridge';
import { loadPetMouseSettings, savePetMouseSettings, subscribePetMouseSettings, type PetMouseSettings } from '../../shared/pet/mouseSettings';
import { loadPetVisualStyle, savePetVisualStyle, subscribePetVisualStyle, type PetVisualStyle } from '../../shared/pet/petVisualStyle';
import { loadPetRoamSettings, savePetRoamSettings, subscribePetRoamSettings } from '../../shared/pet/petRoamSettings';
import { loadPetRippleSettings, savePetRippleSettings, subscribePetRippleSettings } from '../../shared/pet/petRippleSettings';
import { YandereOverlay } from './components/YandereOverlay';
import { chatFontFamily, chatFontUrl, loadChatAppearance, saveChatAppearance, type ChatAppearance } from '../../shared/chatAppearance';
import { ParticleBackground } from './components/ParticleBackground';
import { Ribbon } from './components/Ribbon';
import { SidebarPanel } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { GroupChatPanel } from './components/GroupChatPanel';
import { GroupListPanel } from './components/GroupListPanel';
import { PaneHost } from './components/Panes';
import { SpecPanel } from './components/SpecPanel';
import { DreamAfterglowBanner } from '../dream/components/DreamAfterglowBanner';
import { DreamWindow } from '../dream/DreamWindow';
import { getDayNight, setTheme as applyRegisteredTheme, setThemeMode, subscribe as subscribeTheme } from '../../shared/theme/registry';
import { applyMoodOverlay, clearMoodOverlay } from '../../shared/theme/moodReactive';
import { PreferencesPanel } from './components/preferences/PreferencesPanel';
import { Divider, VideoBg } from './components/ChatShellAtoms';
import { LayoutHost } from './components/LayoutHost';
import { getLayout, listLayouts, setLayout, subscribe as subscribeLayout } from '../../shared/layout/registry';
import type { LayoutRecord } from '../../shared/layout/types';

const SIDEBAR_MIN = 250;
const SIDEBAR_MAX = 540;
const SIDEBAR_DEFAULT = 340;

function getLayoutSidebarWidth(layout: LayoutRecord): number {
  const layoutDefault = layout.manifest.slots.sidebar.size ?? SIDEBAR_DEFAULT;
  // Preserve the pre-layout-registry width for the original layout, while
  // allowing every mod to demonstrate its own declared default width.
  const fallback = layout.manifest.id === 'obsidian-default'
    ? getUIPref('chat.sidebarWidth', layoutDefault)
    : layoutDefault;
  return getUIPref(`chat.sidebarWidth.${layout.manifest.id}`, fallback);
}

export function ChatWindow({ onActivityOpen, onToyOpen, onRoomOpen }: { onActivityOpen?: () => void; onToyOpen?: () => void; onRoomOpen?: () => void } = {}) {
  const engineRef = useRef<StateEngine | null>(null);
  if (!engineRef.current) engineRef.current = new StateEngine();
  const engine = engineRef.current;
  useBackendStatePolling(engine, { moodMs: 120_000, activityMs: 180_000 });

  const [theme, setTheme]                         = useState(() => getUIPref('chat.theme', 'paper'));
  const [themeMode, setThemeMode_]               = useState<'manual' | 'auto'>(() => getDayNight().mode);
  const [chatBackground, setChatBackground]        = useState(() => avatarStore.get().chatBackground);
  const [petVisible, setPetVisible]               = useState(false);
  const [activeLayout, setActiveLayout]           = useState(() => getLayout());
  const [layoutOptions, setLayoutOptions]         = useState<LayoutRecord[]>(() => [getLayout()]);
  const [sidebarOpen, setSidebarOpen]             = useState(() => !getLayout().manifest.slots.sidebar.hidden);
  const [sidebarTab, setSidebarTab]               = useState('flow');
  const [sidebarWidth, setSidebarWidth]           = useState(() => getLayoutSidebarWidth(getLayout()));
  const [chatHeaderVisible, setChatHeaderVisible] = useState(() => getUIPref('chat.headerVisible', true));
  const [appearance, setAppearance]               = useState<ChatAppearance>(() => loadChatAppearance());
  const [petMouseSettings, setPetMouseSettings]   = useState<PetMouseSettings>(() => loadPetMouseSettings());
  const [petVisualStyle, setPetVisualStyle]       = useState<PetVisualStyle>(() => loadPetVisualStyle());
  const [model3dZoom, setModel3dZoom]             = useState<number>(() => getUIPref('pet.model3d.zoom', 1));
  const [live2dZoom, setLive2dZoom]               = useState<number>(() => getUIPref('pet.live2d.zoom', 1));
  const [presenceNagEnabled, setPresenceNagEnabledState] = useState(() => isPresenceNagEnabled());
  const [proactiveGapHours, setProactiveGapHours] = useState(0.75);
  const [playModeEnabled, setPlayModeEnabledState] = useState(() => isPlayModeEnabled());
  const [petRoamEnabled, setPetRoamEnabled] = useState(() => loadPetRoamSettings().enabled);
  const [petRippleEnabled, setPetRippleEnabled] = useState(() => loadPetRippleSettings().enabled);
  const [yandereOpen, setYandereOpen] = useState(false);
  const [loadedFontFamily, setLoadedFontFamily]   = useState<string | null>(null);
  const [specOpen, setSpecOpen]                   = useState(false);
  const [prefsOpen, setPrefsOpen]                 = useState(false);
  const [dreamWindowOpen, setDreamWindowOpen]     = useState(false);
  const [dreamContext, setDreamContext] = useState<{
    mode: 'single' | 'group';
    groupId: string | null;
    roster: Record<string, { label: string; avatarDataUrl: string | null }>;
  }>({ mode: 'single', groupId: null, roster: {} });
  const [dreamAfterglow, setDreamAfterglow]       = useState(false);
  const [characterAvatarDataUrl, setCharacterAvatarDataUrl] = useState<string | null>(null);
  const [charSwitchKey, setCharSwitchKey] = useState(0);
  // null = 1v1 chat | 'list' = group list | string = group_id
  const [groupView, setGroupView]                 = useState<null | 'list' | string>(null);

  useEffect(() => {
    applyRegisteredTheme(theme).catch(error => console.warn('[theme] 切换失败:', error));
  }, [theme]);

  useEffect(() => subscribeTheme(() => {
    setTheme(getUIPref('chat.theme', 'paper'));
    setThemeMode_(getDayNight().mode);
  }), []);
  useEffect(() => {
    let mounted = true;
    const syncLayout = () => {
      if (!mounted) return;
      const layout = getLayout();
      setActiveLayout(layout);
      setSidebarWidth(getLayoutSidebarWidth(layout));
    };
    const offLayout = subscribeLayout(syncLayout);
    void listLayouts()
      .then(layouts => {
        if (mounted) setLayoutOptions(layouts);
        return setLayout(getLayout().manifest.id);
      })
      .then(layout => {
        if (!mounted) return;
        setActiveLayout(layout);
        setSidebarWidth(getLayoutSidebarWidth(layout));
        setSidebarOpen(!layout.manifest.slots.sidebar.hidden);
      })
      .catch(error => console.warn('[layout] 初始化失败:', error));
    return () => { mounted = false; offLayout(); };
  }, []);
  useEffect(() => avatarStore.subscribe(c => setChatBackground(c.chatBackground)), []);
  useEffect(() => subscribePetMouseSettings(setPetMouseSettings), []);
  useEffect(() => subscribePetVisualStyle(setPetVisualStyle), []);
  useEffect(() => subscribePetRoamSettings(s => setPetRoamEnabled(s.enabled)), []);
  useEffect(() => subscribePetRippleSettings(s => setPetRippleEnabled(s.enabled)), []);

  useEffect(() => {
    if (!prefsOpen) return;
    getProactiveGapHours().then(setProactiveGapHours).catch(console.warn);
  }, [prefsOpen]);

  useEffect(() => {
    const publishEngineSnapshot = () => {
      const state = engine.get();
      publishPetSnapshot({
        mood: state.mood,
        presence: state.presence,
      });
    };
    publishEngineSnapshot();
    const unsubscribeEngine = engine.subscribe(publishEngineSnapshot);
    let unsubscribeResponder: (() => void) | undefined;
    startPetSnapshotResponder()
      .then(unsubscribe => { unsubscribeResponder = unsubscribe; })
      .catch(error => console.warn('[pet] ready 监听失败:', error));
    return () => {
      unsubscribeEngine();
      unsubscribeResponder?.();
    };
  }, [engine]);

  // Mood-reactive theme overlay
  useEffect(() => {
    if (!appearance.moodReactive.enabled) {
      clearMoodOverlay();
      return;
    }
    const apply = () => applyMoodOverlay(engine.get().mood, appearance.moodReactive.intensity);
    apply();
    const unsub = engine.subscribe(apply);
    return () => { unsub(); };
  }, [engine, appearance.moodReactive.enabled, appearance.moodReactive.intensity]);

  // Clear overlay on unmount
  useEffect(() => () => clearMoodOverlay(), []);

  const updateAppearance = useCallback((patch: Partial<ChatAppearance>) => {
    setAppearance(current => {
      const next = { ...current, ...patch };
      saveChatAppearance(next);
      return next;
    });
  }, []);

  const updatePetMouseSettings = useCallback((patch: Partial<PetMouseSettings>) => {
    setPetMouseSettings(savePetMouseSettings(patch));
  }, []);

  const updatePetVisualStyle = useCallback((style: PetVisualStyle) => {
    setPetVisualStyle(savePetVisualStyle(style));
  }, []);

  const updateModel3dZoom = useCallback((zoom: number) => {
    const clamped = Math.max(0.3, Math.min(4, zoom));
    setModel3dZoom(clamped);
    setUIPref('pet.model3d.zoom', clamped);
    void emitPetPrefs({ model3dZoom: clamped });
  }, []);

  const updateLive2dZoom = useCallback((zoom: number) => {
    const clamped = Math.max(0.3, Math.min(4, zoom));
    setLive2dZoom(clamped);
    setUIPref('pet.live2d.zoom', clamped);
    void emitPetPrefs({ live2dZoom: clamped });
  }, []);

  const handleYandereOpen = useCallback(() => {
    setPrefsOpen(false);
    setYandereOpen(true);
  }, []);

  const loadCharacterAvatar = useCallback(async (charId: string | null) => {
    if (!charId) { setCharacterAvatarDataUrl(null); return; }
    try {
      setCharacterAvatarDataUrl(await getCharacterAvatar(charId));
    } catch {
      setCharacterAvatarDataUrl(null);
    }
  }, []);

  useEffect(() => {
    void refreshActiveCharacterInfo();
    getPromptAssets()
      .then(assets => loadCharacterAvatar(assets.active.active_character || null))
      .catch(() => {});
  }, [loadCharacterAvatar]);

  useEffect(() => {
    if (!appearance.fontFile) {
      setLoadedFontFamily(null);
      return;
    }
    const family = chatFontFamily(appearance.fontFile)!;
    const font = new FontFace(family, `url("${chatFontUrl(appearance.fontFile)}")`);
    let disposed = false;
    font.load()
      .then(loaded => {
        if (disposed) return;
        document.fonts.add(loaded);
        setLoadedFontFamily(family);
      })
      .catch(() => {
        if (!disposed) setLoadedFontFamily(null);
      });
    return () => { disposed = true; };
  }, [appearance.fontFile]);

  const mouseRef       = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const chatRectRef    = useRef<DOMRect | null>(null);
  const sidebarRectRef = useRef<DOMRect | null>(null);
  const bodyRef        = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      engine.markInteraction();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [engine]);

  const onPetToggle = async () => {
    const next = !petVisible;
    try {
      await setPetWindowVisible(next);
      setPetVisible(next);
      engine.setMode(next ? 'companion' : 'chat-only');
    } catch (error) {
      console.warn('[pet] window 显隐失败:', error);
    }
  };

  const closeDreamAfterglow = useCallback(() => {
    setDreamAfterglow(false);
  }, []);

  const toggleDreamWindow = useCallback(() => {
    if (dreamWindowOpen) {
      setDreamWindowOpen(false);
    } else {
      setDreamAfterglow(false);
      setDreamContext({ mode: 'single', groupId: null, roster: {} });
      setDreamWindowOpen(true);
    }
  }, [dreamWindowOpen]);

  useEffect(() => wsClient.on('dream_invite', () => {
    setDreamAfterglow(false);
    setDreamContext({ mode: 'single', groupId: null, roster: {} });
    setDreamWindowOpen(true);
  }), []);

  // Pet main-channel forward layer (cc-tasks/14 §D): re-broadcast WS turn events to the pet
  // window verbatim, full text, no summarizing. Deliberately at this shell level rather than
  // inside ChatPanel so its dedup guard / dream gating / fallback races can never swallow a
  // pet bubble the way they could when the pet bubble was just a ChatPanel-side summary.
  useEffect(() => {
    const offs = [
      wsClient.on('channel_message', payload => { void emitPetTurn({ kind: 'channel_message', ...payload }); }),
      wsClient.on('message_segments', payload => { void emitPetTurn({ kind: 'message_segments', ...payload }); }),
      wsClient.on('message_stream_start', payload => { void emitPetTurn({ kind: 'message_stream_start', ...payload }); }),
      wsClient.on('message_stream_delta', payload => { void emitPetTurn({ kind: 'message_stream_delta', ...payload }); }),
      wsClient.on('message_stream_end', payload => { void emitPetTurn({ kind: 'message_stream_end', ...payload }); }),
    ];
    return () => offs.forEach(off => off());
  }, []);

  // 玩耍模式邀请：仅在开关开启时自动开窗，关闭时忽略（仍正常 ack）。
  useEffect(() => wsClient.on('toy_invite', () => {
    if (isPlayModeEnabled()) onToyOpen?.();
  }), [onToyOpen]);

  const onSidebarTab = (tab: string) => { setSidebarTab(tab); setSidebarOpen(true); };
  const onCloseSidebar = () => setSidebarOpen(false);

  const selectLayout = (id: string) => {
    void setLayout(id)
      .then(layout => {
        setActiveLayout(layout);
        setSidebarWidth(getLayoutSidebarWidth(layout));
        setSidebarOpen(!layout.manifest.slots.sidebar.hidden);
      })
      .catch(error => console.warn('[layout] 切换失败:', error));
  };

  const sidebarOnRight = activeLayout.manifest.direction === 'row'
    ? activeLayout.manifest.slots.sidebar.order > activeLayout.manifest.slots.main.order
    : activeLayout.manifest.slots.sidebar.order < activeLayout.manifest.slots.main.order;

  const onDividerDrag = (clientX: number) => {
    if (!bodyRef.current) return;
    const mainRect = bodyRef.current.getBoundingClientRect();
    const delta = sidebarOnRight ? mainRect.right - clientX : clientX - mainRect.left;
    const w = sidebarWidth + delta;
    const max = Math.min(SIDEBAR_MAX, mainRect.width + sidebarWidth - 360);
    const next = Math.max(SIDEBAR_MIN, Math.min(max, w));
    setSidebarWidth(next);
    setUIPref(`chat.sidebarWidth.${activeLayout.manifest.id}`, next);
  };

  return (
    <div style={{ height: '100vh', position: 'relative', background: 'var(--paper)' }}>
      <div
        className="chat-ui"
        style={{
          height: '100%',
          '--chat-theme-font-scale': appearance.themeFontSize / 14,
          '--motion-scale': appearance.motionScale,
          ...(loadedFontFamily ? {
            '--font-serif': loadedFontFamily,
            '--font-sans': loadedFontFamily,
            '--font-mono': loadedFontFamily,
            fontFamily: loadedFontFamily,
          } : {}),
        } as CSSProperties}
      >
        <LayoutHost
          manifest={activeLayout.manifest}
          sidebarSize={sidebarWidth}
          slots={{
            ribbon: <Ribbon
              sidebarOpen={sidebarOpen}
              sidebarTab={sidebarTab}
              onSidebarTab={onSidebarTab}
              onCloseSidebar={onCloseSidebar}
              petVisible={petVisible}
              onPetToggle={onPetToggle}
              onOpenSpec={() => setSpecOpen(true)}
              onOpenPrefs={() => setPrefsOpen(true)}
              dreamWindowOpen={dreamWindowOpen}
              onDreamToggle={toggleDreamWindow}
              onActivityOpen={onActivityOpen}
              onToyOpen={onToyOpen}
              playModeEnabled={playModeEnabled}
              onGroupOpen={() => setGroupView('list')}
            />,
            sidebar: sidebarOpen ? <div style={{ display: 'flex', height: '100%', minWidth: 0, flex: 1 }}>
              {sidebarOnRight && <Divider onDrag={onDividerDrag} />}
              <div style={{ flex: 1, minWidth: 0 }}><SidebarPanel
                engine={engine}
                sidebarRectRef={sidebarRectRef}
                tab={sidebarTab}
                onClose={() => setSidebarOpen(false)} /></div>
              {!sidebarOnRight && <Divider onDrag={onDividerDrag} />}
            </div> : null,
            main: <div ref={bodyRef} className="chat-ui__body" style={{ height: '100%', minHeight: 0, minWidth: 0, position: 'relative', '--chat-background-blur': `${appearance.backgroundBlur}px` } as CSSProperties}>
          {/* image: explicit or backward-compat (had a dataUrl before backgroundKind existed) */}
          {(appearance.backgroundKind === 'image' || (appearance.backgroundKind === 'none' && chatBackground.dataUrl)) && chatBackground.dataUrl && (
            <div className="chat-ui__background"
                 style={{ backgroundImage: `url("${chatBackground.dataUrl}")` } as CSSProperties}
                 aria-hidden="true" />
          )}
          {appearance.backgroundKind === 'particles' && (
            <ParticleBackground engine={engine} blur={appearance.backgroundBlur} />
          )}
          {appearance.backgroundKind === 'video' && appearance.backgroundVideoPath && (
            <VideoBg src={appearance.backgroundVideoPath} blur={appearance.backgroundBlur} />
          )}
          <div style={{ height: '100%', minWidth: 0 }}>
            {groupView === null ? (
              <ChatPanel key={charSwitchKey} engine={engine} chatRectRef={chatRectRef} headerVisible={chatHeaderVisible} chatFontSize={appearance.chatFontSize} dreamActive={dreamWindowOpen} characterAvatarDataUrl={characterAvatarDataUrl} mainLayout={activeLayout.manifest.mainLayout} onOpenRoom={onRoomOpen} onOpenPrefs={() => setPrefsOpen(true)} />
            ) : groupView === 'list' ? (
              <GroupListPanel
                onSelectGroup={id => setGroupView(id)}
                onBack={() => setGroupView(null)}
              />
            ) : (
              <GroupChatPanel
                groupId={groupView}
                onBack={() => setGroupView('list')}
                onDreamEnter={(group, roster) => {
                  setDreamAfterglow(false);
                  setDreamContext({ mode: 'group', groupId: group.group_id, roster });
                  setDreamWindowOpen(true);
                }}
                fontSize={appearance.chatFontSize}
              />
            )}
          </div>
            </div>,
          }}
        />
      </div>

      {dreamWindowOpen && (
        <DreamWindow
          mode={dreamContext.mode}
          groupId={dreamContext.groupId}
          groupRoster={dreamContext.roster}
          characterAvatarDataUrl={characterAvatarDataUrl}
          onClose={() => {
            setDreamWindowOpen(false);
            setDreamAfterglow(true);
          }}
        />
      )}
      <DreamAfterglowBanner
        visible={dreamAfterglow}
        onClose={closeDreamAfterglow}
      />
      <PaneHost />
      <SpecPanel open={specOpen} onClose={() => setSpecOpen(false)} />
      <PreferencesPanel
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        themeMode={themeMode}
        onThemeModeChange={() => {
          const next = themeMode === 'auto' ? 'manual' : 'auto';
          setThemeMode_(next);
          setThemeMode(next).catch(console.warn);
        }}
        chatHeaderVisible={chatHeaderVisible}
        onChatHeaderToggle={() => setChatHeaderVisible(v => { const next = !v; setUIPref('chat.headerVisible', next); return next; })}
        appearance={appearance}
        onAppearanceChange={updateAppearance}
        activeLayout={activeLayout.manifest.id}
        layoutOptions={layoutOptions}
        onLayoutChange={selectLayout}
        petMouseSettings={petMouseSettings}
        onPetMouseSettingsChange={updatePetMouseSettings}
        petVisualStyle={petVisualStyle}
        onPetVisualStyleChange={updatePetVisualStyle}
        model3dZoom={model3dZoom}
        onModel3dZoomChange={updateModel3dZoom}
        live2dZoom={live2dZoom}
        onLive2dZoomChange={updateLive2dZoom}
        presenceNagEnabled={presenceNagEnabled}
        proactiveGapHours={proactiveGapHours}
        onProactiveGapChange={(v: number) => {
          setProactiveGapHours(v);
          patchProactiveGapHours(v).catch(error => console.warn('[proactive_gap] 保存失败:', error));
        }}
        onPresenceNagToggle={() => {
          const next = !presenceNagEnabled;
          void patchPresenceNagEnabled(next)
            .then(() => {
              setPresenceNagEnabledState(next);
              if (!next) void invoke('presence_nag_close_all').catch(error => console.warn('[presence_nag] 全部关闭失败:', error));
            })
            .catch(error => console.warn('[presence_nag] 切换失败:', error));
        }}
        playModeEnabled={playModeEnabled}
        onPlayModeToggle={() => {
          const next = !playModeEnabled;
          setPlayModeEnabled(next);
          setPlayModeEnabledState(next);
        }}
        petRoamEnabled={petRoamEnabled}
        onPetRoamToggle={() => savePetRoamSettings({ enabled: !petRoamEnabled })}
        petRippleEnabled={petRippleEnabled}
        onPetRippleToggle={() => savePetRippleSettings({ enabled: !petRippleEnabled })}
        onYandereOpen={handleYandereOpen}
        onCharacterAvatarChange={setCharacterAvatarDataUrl}
        onCharacterSwitched={() => setCharSwitchKey(k => k + 1)} />
      {yandereOpen && <YandereOverlay onClose={() => setYandereOpen(false)} />}
    </div>
  );
}
