import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StateEngine } from '../../shared/state/store';
import { ToolStatusOverlayController, type ToolStatusOverlayState } from '../../shared/state/toolStatusOverlay';
import { wsClient } from '../../shared/api/ws';
import { getDiarySyncStatus, syncDiary } from '../../shared/api/diary-sync';
import { refreshActiveCharacterInfo, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { getCharacterAvatar, getPromptAssets } from '../../shared/api/backend';
import { isPresenceNagEnabled, patchPresenceNagEnabled } from '../../shared/presenceNag';
import { getProactiveGapHours, patchProactiveGapHours } from '../../shared/proactiveGap';
import { YandereOverlay } from './components/YandereOverlay';
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
import { PreferencesPanel } from './components/preferences/PreferencesPanel';
import { Divider, VideoBg } from './components/ChatShellAtoms';
import { LayoutHost } from './components/LayoutHost';
import { DesignModHost } from './components/DesignModHost';
import { DesignAwareRegion } from '../../shared/design-mod/regions';
import { SidebarCapability } from './components/Sidebar';
import { createSidebarPresenters, type SidebarPresenters } from '../../shared/design-mod/presenters';
import { setSelectedDesignModId } from '../../shared/design-mod/runtime';
import { useChatAppearanceController } from './hooks/useChatAppearanceController';
import { usePetController } from './hooks/usePetController';
import { useChatWindowNavigation } from './hooks/useChatWindowNavigation';

export function ChatWindow({ onActivityOpen, onToyOpen, onRoomOpen, isCovered = false }: { onActivityOpen?: () => void; onToyOpen?: () => void; onRoomOpen?: () => void; isCovered?: boolean } = {}) {
  const engineRef = useRef<StateEngine | null>(null);
  if (!engineRef.current) engineRef.current = new StateEngine();
  const engine = engineRef.current;
  const presentersRef = useRef<SidebarPresenters | null>(null);
  if (!presentersRef.current) presentersRef.current = createSidebarPresenters(engine);
  const presenters = presentersRef.current;
  const toolStatusRef = useRef<ToolStatusOverlayController | null>(null);
  if (!toolStatusRef.current) toolStatusRef.current = new ToolStatusOverlayController();
  const toolStatusController = toolStatusRef.current;
  const [toolStatus, setToolStatus] = useState<ToolStatusOverlayState | null>(() => toolStatusController.get());
  const navigation = useChatWindowNavigation();
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  useEffect(() => {
    presenters.setToolStatus(toolStatus);
  }, [presenters, toolStatus]);

  useEffect(() => () => presenters.dispose(), [presenters]);

  useEffect(() => {
    const handleVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  const visualPaused = isCovered || navigation.dreamWindowOpen || !documentVisible;

  const appearanceController = useChatAppearanceController(engine);
  const petController = usePetController(engine, onToyOpen);
  const [presenceNagEnabled, setPresenceNagEnabledState] = useState(() => isPresenceNagEnabled());
  const [proactiveGapHours, setProactiveGapHours] = useState(0.75);
  const [characterAvatarDataUrl, setCharacterAvatarDataUrl] = useState<string | null>(null);
  const [charSwitchKey, setCharSwitchKey] = useState(0);

  useEffect(() => {
    const unsubscribeState = toolStatusController.subscribe(setToolStatus);
    const unsubscribeWs = wsClient.on('tool_status', payload => toolStatusController.receive(payload));
    return () => {
      unsubscribeState();
      unsubscribeWs();
      toolStatusController.dispose();
    };
  }, [toolStatusController]);

  useEffect(() => {
    let running = false;
    const runDiarySync = async () => {
      if (running) return;
      running = true;
      try {
        const status = await getDiarySyncStatus();
        if (status.configured) await syncDiary();
      } catch {
        // Diary sync is optional and must never block chat or surface a
        // background network error as a chat/auth failure.
      } finally {
        running = false;
      }
    };
    void runDiarySync();
    const unsubscribeWs = wsClient.on('state', state => {
      if (state === 'connected') void runDiarySync();
    });
    const timer = window.setInterval(() => void runDiarySync(), 15 * 60 * 1000);
    return () => {
      unsubscribeWs();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!navigation.prefsOpen) return;
    getProactiveGapHours().then(setProactiveGapHours).catch(console.warn);
  }, [navigation.prefsOpen]);

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

  const mouseRef       = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const chatRectRef    = useRef<DOMRect | null>(null);
  const sidebarRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      engine.markInteraction();
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [engine]);

  return (
    <div style={{ height: '100vh', position: 'relative', background: 'var(--paper)' }}>
      <div
        className="chat-ui"
        style={{
          height: '100%',
          '--chat-theme-font-scale': appearanceController.appearance.themeFontSize / 14,
          '--motion-scale': appearanceController.appearance.motionScale,
          ...(appearanceController.loadedFontFamily ? {
            '--font-serif': appearanceController.loadedFontFamily,
            '--font-sans': appearanceController.loadedFontFamily,
            '--font-mono': appearanceController.loadedFontFamily,
            fontFamily: appearanceController.loadedFontFamily,
          } : {}),
        } as CSSProperties}
      >
        <DesignModHost
          engine={engine}
          presenters={presenters}
          toolStatus={toolStatus}
          isCovered={isCovered}
          dreamActive={navigation.dreamWindowOpen}
          navigation={{ groupView: navigation.groupView, sidebarTab: appearanceController.sidebarTab, sidebarOpen: appearanceController.sidebarOpen }}
          commands={{
            closeSidebar: appearanceController.closeSidebar,
            setSidebarTab: appearanceController.onSidebarTab,
            openPrefs: () => navigation.setPrefsOpen(true),
              restoreDefault: () => { setSelectedDesignModId('builtin-default'); navigation.setPrefsOpen(true); },
          }}
          renderSidebar={tab => <SidebarCapability presenters={presenters} sidebarRectRef={sidebarRectRef} tab={tab} />}
          renderChat={
          <LayoutHost
          manifest={appearanceController.activeLayout.manifest}
          sidebarSize={appearanceController.sidebarWidth}
          slots={{
            ribbon: <DesignAwareRegion id="chat.ribbon"><Ribbon
              sidebarOpen={appearanceController.sidebarOpen}
              sidebarTab={appearanceController.sidebarTab}
              onSidebarTab={appearanceController.onSidebarTab}
              onCloseSidebar={appearanceController.closeSidebar}
              petVisible={petController.petVisible}
              onPetToggle={petController.togglePet}
              onOpenSpec={() => navigation.setSpecOpen(true)}
              onOpenPrefs={() => navigation.setPrefsOpen(true)}
              dreamWindowOpen={navigation.dreamWindowOpen}
              onDreamToggle={navigation.toggleDreamWindow}
              onActivityOpen={onActivityOpen}
              onToyOpen={onToyOpen}
              playModeEnabled={petController.playModeEnabled}
              onGroupOpen={() => navigation.setGroupView('list')}
            /></DesignAwareRegion>,
            sidebar: appearanceController.sidebarOpen ? <div style={{ display: 'flex', height: '100%', minWidth: 0, flex: 1 }}>
              {appearanceController.sidebarOnRight && <Divider onDrag={appearanceController.onDividerDrag} />}
              <div style={{ flex: 1, minWidth: 0 }}><SidebarPanel
                engine={engine}
                toolStatus={toolStatus}
                presenters={presenters}
                sidebarRectRef={sidebarRectRef}
                paused={visualPaused}
                tab={appearanceController.sidebarTab}
                onClose={appearanceController.closeSidebar} /></div>
              {!appearanceController.sidebarOnRight && <Divider onDrag={appearanceController.onDividerDrag} />}
            </div> : null,
            main: <div ref={appearanceController.bodyRef} className="chat-ui__body" style={{ height: '100%', minHeight: 0, minWidth: 0, position: 'relative', '--chat-background-blur': `${appearanceController.appearance.backgroundBlur}px` } as CSSProperties}>
          {/* image: explicit or backward-compat (had a dataUrl before backgroundKind existed) */}
          {(appearanceController.appearance.backgroundKind === 'image' || (appearanceController.appearance.backgroundKind === 'none' && appearanceController.chatBackground.dataUrl)) && appearanceController.chatBackground.dataUrl && (
            <div className="chat-ui__background"
                 style={{ backgroundImage: `url("${appearanceController.chatBackground.dataUrl}")` } as CSSProperties}
                 aria-hidden="true" />
          )}
          {appearanceController.appearance.backgroundKind === 'particles' && (
            <ParticleBackground engine={engine} blur={appearanceController.appearance.backgroundBlur} paused={visualPaused} />
          )}
          {appearanceController.appearance.backgroundKind === 'video' && appearanceController.appearance.backgroundVideoPath && (
            <VideoBg src={appearanceController.appearance.backgroundVideoPath} blur={appearanceController.appearance.backgroundBlur} paused={visualPaused} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0 }}>
            {navigation.groupView === null ? (
              <ChatPanel key={charSwitchKey} engine={engine} chatRectRef={chatRectRef} headerVisible={appearanceController.chatHeaderVisible} chatFontSize={appearanceController.appearance.chatFontSize} dreamActive={navigation.dreamWindowOpen} characterAvatarDataUrl={characterAvatarDataUrl} mainLayout={appearanceController.activeLayout.manifest.mainLayout} onOpenRoom={onRoomOpen} onOpenPrefs={() => navigation.setPrefsOpen(true)} />
            ) : navigation.groupView === 'list' ? (
              <GroupListPanel
                onSelectGroup={id => navigation.setGroupView(id)}
                onBack={() => navigation.setGroupView(null)}
              />
            ) : (
              <GroupChatPanel
                groupId={navigation.groupView}
                onBack={() => navigation.setGroupView('list')}
                onDreamEnter={(group, roster) => navigation.openGroupDream(group.group_id, roster)}
                fontSize={appearanceController.appearance.chatFontSize}
              />
            )}
          </div>
            </div>,
          }}
          />}
        />
      </div>

      {navigation.dreamWindowOpen && (
        <DreamWindow
          mode={navigation.dreamContext.mode}
          groupId={navigation.dreamContext.groupId}
          groupRoster={navigation.dreamContext.roster}
          characterAvatarDataUrl={characterAvatarDataUrl}
          onClose={navigation.closeDream}
        />
      )}
      <DreamAfterglowBanner
        visible={navigation.dreamAfterglow}
        onClose={navigation.closeDreamAfterglow}
      />
      <PaneHost />
      <SpecPanel open={navigation.specOpen} onClose={() => navigation.setSpecOpen(false)} />
      <PreferencesPanel
        open={navigation.prefsOpen}
        onClose={() => navigation.setPrefsOpen(false)}
        themeMode={appearanceController.themeMode}
        onThemeModeChange={appearanceController.toggleThemeMode}
        chatHeaderVisible={appearanceController.chatHeaderVisible}
        onChatHeaderToggle={appearanceController.toggleChatHeader}
        appearance={appearanceController.appearance}
        onAppearanceChange={appearanceController.updateAppearance}
        activeLayout={appearanceController.activeLayout.manifest.id}
        layoutOptions={appearanceController.layoutOptions}
        onLayoutChange={appearanceController.selectLayout}
        petMouseSettings={petController.petMouseSettings}
        onPetMouseSettingsChange={petController.updatePetMouseSettings}
        petVisualStyle={petController.petVisualStyle}
        onPetVisualStyleChange={petController.updatePetVisualStyle}
        model3dZoom={petController.model3dZoom}
        onModel3dZoomChange={petController.updateModel3dZoom}
        live2dZoom={petController.live2dZoom}
        onLive2dZoomChange={petController.updateLive2dZoom}
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
        playModeEnabled={petController.playModeEnabled}
        onPlayModeToggle={petController.togglePlayMode}
        petRoamEnabled={petController.petRoamEnabled}
        onPetRoamToggle={petController.togglePetRoam}
        petRippleEnabled={petController.petRippleEnabled}
        onPetRippleToggle={petController.togglePetRipple}
        onYandereOpen={navigation.openYandere}
        onCharacterAvatarChange={setCharacterAvatarDataUrl}
        onCharacterSwitched={() => setCharSwitchKey(k => k + 1)} />
      {navigation.yandereOpen && <YandereOverlay onClose={() => navigation.setYandereOpen(false)} />}
    </div>
  );
}
