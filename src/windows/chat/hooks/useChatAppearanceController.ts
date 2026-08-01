import { useCallback, useEffect, useRef, useState } from 'react';
import type { StateEngine } from '../../../shared/state/store';
import { avatarStore } from '../../../shared/avatars/store';
import { chatFontFamily, chatFontUrl, loadChatAppearance, saveChatAppearance, type ChatAppearance } from '../../../shared/chatAppearance';
import { getDayNight, setTheme as applyRegisteredTheme, setThemeMode, subscribe as subscribeTheme } from '../../../shared/theme/registry';
import { applyMoodOverlay, clearMoodOverlay } from '../../../shared/theme/moodReactive';
import { getUIPref, setUIPref } from '../../../shared/uiPreferences';
import { getLayout, listLayouts, setLayout, subscribe as subscribeLayout } from '../../../shared/layout/registry';
import type { LayoutRecord } from '../../../shared/layout/types';

const SIDEBAR_MIN = 250;
const SIDEBAR_MAX = 540;
const SIDEBAR_DEFAULT = 340;

function getLayoutSidebarWidth(layout: LayoutRecord): number {
  const layoutDefault = layout.manifest.slots.sidebar.size ?? SIDEBAR_DEFAULT;
  const fallback = layout.manifest.id === 'obsidian-default'
    ? getUIPref('chat.sidebarWidth', layoutDefault)
    : layoutDefault;
  return getUIPref(`chat.sidebarWidth.${layout.manifest.id}`, fallback);
}

function getLayoutSidebarOpen(layout: LayoutRecord): boolean {
  return getUIPref(`chat.sidebarOpen.${layout.manifest.id}`, !layout.manifest.slots.sidebar.hidden);
}

export function useChatAppearanceController(engine: StateEngine) {
  const [theme, setTheme] = useState(() => getUIPref('chat.theme', 'paper'));
  const [themeMode, setThemeModeState] = useState<'manual' | 'auto'>(() => getDayNight().mode);
  const [chatBackground, setChatBackground] = useState(() => avatarStore.get().chatBackground);
  const [activeLayout, setActiveLayout] = useState(() => getLayout());
  const [layoutOptions, setLayoutOptions] = useState<LayoutRecord[]>(() => [getLayout()]);
  const [sidebarOpen, setSidebarOpen] = useState(() => getLayoutSidebarOpen(getLayout()));
  const [sidebarTab, setSidebarTab] = useState(() => getUIPref('chat.sidebarTab', 'flow'));
  const [sidebarWidth, setSidebarWidth] = useState(() => getLayoutSidebarWidth(getLayout()));
  const [chatHeaderVisible, setChatHeaderVisible] = useState(() => getUIPref('chat.headerVisible', true));
  const [appearance, setAppearance] = useState<ChatAppearance>(() => loadChatAppearance());
  const [loadedFontFamily, setLoadedFontFamily] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyRegisteredTheme(theme).catch(error => console.warn('[theme] 切换失败:', error));
  }, [theme]);

  useEffect(() => subscribeTheme(() => {
    setTheme(getUIPref('chat.theme', 'paper'));
    setThemeModeState(getDayNight().mode);
  }), []);

  useEffect(() => {
    let mounted = true;
    const syncLayout = () => {
      if (!mounted) return;
      const layout = getLayout();
      setActiveLayout(layout);
      setSidebarWidth(getLayoutSidebarWidth(layout));
      setSidebarOpen(getLayoutSidebarOpen(layout));
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
        setSidebarOpen(getLayoutSidebarOpen(layout));
      })
      .catch(error => console.warn('[layout] 初始化失败:', error));
    return () => { mounted = false; offLayout(); };
  }, []);

  useEffect(() => avatarStore.subscribe(c => setChatBackground(c.chatBackground)), []);

  useEffect(() => {
    if (!appearance.moodReactive.enabled) {
      clearMoodOverlay();
      return;
    }
    const apply = () => applyMoodOverlay(engine.get().mood, appearance.moodReactive.intensity);
    apply();
    const unsubscribe = engine.subscribe(apply);
    return () => { unsubscribe(); };
  }, [engine, appearance.moodReactive.enabled, appearance.moodReactive.intensity]);

  useEffect(() => () => clearMoodOverlay(), []);

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
      .catch(() => { if (!disposed) setLoadedFontFamily(null); });
    return () => { disposed = true; };
  }, [appearance.fontFile]);

  const updateAppearance = useCallback((patch: Partial<ChatAppearance>) => {
    setAppearance(current => {
      const next = { ...current, ...patch };
      saveChatAppearance(next);
      return next;
    });
  }, []);

  const toggleThemeMode = useCallback(() => {
    const next = themeMode === 'auto' ? 'manual' : 'auto';
    setThemeModeState(next);
    setThemeMode(next).catch(console.warn);
  }, [themeMode]);

  const toggleChatHeader = useCallback(() => {
    setChatHeaderVisible(current => {
      const next = !current;
      setUIPref('chat.headerVisible', next);
      return next;
    });
  }, []);

  const selectLayout = useCallback((id: string) => {
    void setLayout(id)
      .then(layout => {
        setActiveLayout(layout);
        setSidebarWidth(getLayoutSidebarWidth(layout));
        setSidebarOpen(getLayoutSidebarOpen(layout));
      })
      .catch(error => console.warn('[layout] 切换失败:', error));
  }, []);

  const onSidebarTab = useCallback((tab: string) => {
    setSidebarTab(tab);
    setSidebarOpen(true);
    setUIPref('chat.sidebarTab', tab);
    setUIPref(`chat.sidebarOpen.${activeLayout.manifest.id}`, true);
  }, [activeLayout.manifest.id]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setUIPref(`chat.sidebarOpen.${activeLayout.manifest.id}`, false);
  }, [activeLayout.manifest.id]);

  const sidebarOnRight = activeLayout.manifest.direction === 'row'
    ? activeLayout.manifest.slots.sidebar.order > activeLayout.manifest.slots.main.order
    : activeLayout.manifest.slots.sidebar.order < activeLayout.manifest.slots.main.order;

  const onDividerDrag = useCallback((clientX: number) => {
    if (!bodyRef.current) return;
    const mainRect = bodyRef.current.getBoundingClientRect();
    const delta = sidebarOnRight ? mainRect.right - clientX : clientX - mainRect.left;
    const width = sidebarWidth + delta;
    const max = Math.min(SIDEBAR_MAX, mainRect.width + sidebarWidth - 360);
    const next = Math.max(SIDEBAR_MIN, Math.min(max, width));
    setSidebarWidth(next);
    setUIPref(`chat.sidebarWidth.${activeLayout.manifest.id}`, next);
  }, [activeLayout.manifest.id, sidebarOnRight, sidebarWidth]);

  return {
    bodyRef, themeMode, toggleThemeMode, chatBackground, activeLayout, layoutOptions,
    sidebarOpen, sidebarTab, sidebarWidth, chatHeaderVisible, appearance, loadedFontFamily,
    updateAppearance, toggleChatHeader, selectLayout, onSidebarTab, closeSidebar,
    sidebarOnRight, onDividerDrag,
  };
}
