import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { dreamEnter, dreamExit, dreamWake, dreamResume } from '../../shared/api/dream';
import { useDreamState } from './hooks/useDreamState';
import { useDreamChat } from './hooks/useDreamChat';
import { DreamSidebar } from './components/DreamSidebar';
import { DreamStatusSidebar } from './components/DreamStatusSidebar';
import { DreamPrefsPane } from './components/DreamPrefsPane';
import { DreamHelpPanel } from './components/DreamHelpPanel';
import { DreamControlBar } from './components/DreamControlBar';
import { DreamChatPanel } from './components/DreamChatPanel';
import { SubHiddenStatePanel } from './components/SubHiddenStatePanel';
import { Icon } from '../chat/components/UIKit';
import { classifyHttpError } from '../../shared/api/httpError';
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import { avatarStore } from '../../shared/avatars/store';
import type { DreamEntryMode } from '../../shared/api/dream-types';
import {
  dreamFontFamily,
  dreamFontUrl,
  loadDreamAppearance,
  saveDreamAppearance,
  type DreamAppearance,
} from '../../shared/dreamAppearance';
import '../../features/dream/DreamTokens.css';

type WindowPhase = 'loading' | 'ready' | 'entering' | 'active' | 'ended';
type DreamSideTab = 'flow' | 'status' | 'subconscious';
type DreamModal = 'prefs' | 'help' | null;
type DreamTone = 'day' | 'night';

const SIDEBAR_MIN = 250;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 380;

interface DreamWindowProps {
  characterAvatarDataUrl?: string | null;
  onClose: () => void;
}

export function DreamWindow({ characterAvatarDataUrl = null, onClose }: DreamWindowProps) {
  const { dreamState, stateError, refresh: refreshState } = useDreamState();
  const [phase, setPhase] = useState<WindowPhase>('loading');
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<DreamSideTab>('flow');
  const [openModal, setOpenModal] = useState<DreamModal>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => getUIPref('dream.sidebarWidth', SIDEBAR_DEFAULT));
  const [tone, setTone] = useState<DreamTone>(() => getUIPref('dream.tone', 'night'));
  const [entryMode, setEntryMode] = useState<DreamEntryMode>(() => getUIPref<DreamEntryMode>('dream.entryMode', 'sandbox'));
  const [scenarioScriptId, setScenarioScriptId] = useState(() => getUIPref('dream.scenarioScriptId', 'prison_demo'));
  const [appearance, setAppearance] = useState<DreamAppearance>(() => loadDreamAppearance());
  const [backgrounds, setBackgrounds] = useState(() => avatarStore.get().dreamBackgrounds);
  const [defaultHerAvatarDataUrl, setDefaultHerAvatarDataUrl] = useState(() => avatarStore.get().her.dataUrl);
  const [loadedFontFamily, setLoadedFontFamily] = useState<string | null>(null);
  // Soft retention state: shown when backend returns retained=true from /dream/wake
  const [retentionText, setRetentionText] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const updateAppearance = useCallback((patch: Partial<DreamAppearance>) => {
    setAppearance(current => {
      const next = { ...current, ...patch };
      saveDreamAppearance(next);
      return next;
    });
  }, []);

  useEffect(() => avatarStore.subscribe(config => {
    setBackgrounds(config.dreamBackgrounds);
    setDefaultHerAvatarDataUrl(config.her.dataUrl);
  }), []);

  useEffect(() => {
    if (!appearance.fontFile) {
      setLoadedFontFamily(null);
      return;
    }
    const family = dreamFontFamily(appearance.fontFile)!;
    const font = new FontFace(family, `url("${dreamFontUrl(appearance.fontFile)}")`);
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

  const handleExited = useCallback(() => {
    refreshState();
    setPhase('ended');
  }, [refreshState]);

  const { messages, loading: chatLoading, streamingActive, send, addSystemMsg } = useDreamChat(handleExited);

  // Keep phase in sync with backend state on every poll.
  // Exception: never interrupt an in-progress enter attempt.
  useEffect(() => {
    if (!dreamState || phase === 'entering') return;
    const { status } = dreamState;
    if (status === 'DREAM_ACTIVE' || status === 'DREAM_EXIT_REQUESTED') {
      if (phase !== 'active') {
        if (phase === 'loading') addSystemMsg('— 已在梦境中 —');
        setPhase('active');
      }
    } else if (status === 'DREAM_CLOSING' || status === 'REALITY_AFTERGLOW') {
      if (phase === 'active' || phase === 'ended') {
        if (phase !== 'ended') setPhase('ended');
      } else if (phase !== 'ready') {
        setPhase('ready');
      }
    } else {
      // REALITY_CHAT / DREAM_ENTRANCE_AVAILABLE / DREAM_LOCKED → ready
      if (phase !== 'ready') setPhase('ready');
    }
  }, [dreamState, phase, addSystemMsg]);

  useEffect(() => {
    if (!dreamState || (dreamState.status !== 'DREAM_ACTIVE' && dreamState.status !== 'DREAM_EXIT_REQUESTED')) return;
    const activeMode = dreamState.dream_mode ?? dreamState.mode;
    if (activeMode === 'sandbox' || activeMode === 'scenario' || activeMode === 'mirror') {
      setEntryMode(activeMode);
      setUIPref('dream.entryMode', activeMode);
    }
    const activeScriptId = dreamState.scenario?.script_id ?? dreamState.script_id;
    if (activeMode === 'scenario' && activeScriptId) {
      setScenarioScriptId(activeScriptId);
      setUIPref('dream.scenarioScriptId', activeScriptId);
    }
  }, [dreamState]);

  const handleEnter = async () => {
    const scriptId = scenarioScriptId.trim();
    if (entryMode === 'scenario' && !scriptId) {
      setPhaseError('剧本模式需要填写剧本 ID。');
      return;
    }
    setPhase('entering');
    setPhaseError(null);
    try {
      const resp = await dreamEnter({
        dream_mode: entryMode,
        script_id: entryMode === 'scenario' ? scriptId : undefined,
      });
      console.debug('[Dream] dreamEnter response:', resp);
      if (!resp.ok) {
        console.debug('[Dream] dreamEnter rejected:', resp.error);
        setPhaseError(resp.error ?? '无法进入梦境');
        setPhase('ready');
        return;
      }
      await refreshState();
      addSystemMsg('— 坠入梦中 —');
      setPhase('active');
    } catch (e) {
      console.debug('[Dream] dreamEnter error:', e);
      const classified = classifyHttpError(e);
      if (classified.status === 409) {
        setPhaseError(`当前状态无法进入梦境（${classified.message}）`);
      } else if (classified.status === 503) {
        setPhaseError(`服务暂不可用（${classified.message}）`);
      } else {
        setPhaseError(`连接失败：${classified.message}`);
      }
      setPhase('ready');
    }
  };

  // Hard exit helper — always succeeds, closes window (Invariant D).
  const handleForceExit = useCallback(async () => {
    setRetentionText(null);
    try { await dreamExit(); } catch { /* hard exit always succeeds per spec */ }
    onClose();
  }, [onClose]);

  // WAKE button handler — routes through soft retention gate first.
  // If backend retains: show retention text + stay/leave choice.
  // If backend exits (gate not met / LLM fail / second tap): close window.
  const handleWake = useCallback(async () => {
    // If retention choice is already showing, second WAKE tap → hard exit
    if (retentionText !== null) {
      await handleForceExit();
      return;
    }
    try {
      const result = await dreamWake();
      if (result.retained) {
        // Show retention text as a character message; present stay/leave choice
        addSystemMsg(result.retention_text);
        setRetentionText(result.retention_text);
      } else {
        // Gate not met or LLM failed — backend already exited
        onClose();
      }
    } catch {
      // Network / unexpected error → fall back to hard exit
      await handleForceExit();
    }
  }, [retentionText, handleForceExit, addSystemMsg, onClose]);

  const handleRetentionStay = useCallback(async () => {
    setRetentionText(null);
    try { await dreamResume(); } catch { /* no-op on error; dream will still be active */ }
  }, []);

  const handleRetentionLeave = useCallback(async () => {
    await handleForceExit();
  }, [handleForceExit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openModal) {
        setOpenModal(null);
        return;
      }
      handleWake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleWake, openModal]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !shellRef.current) return;
      const left = shellRef.current.getBoundingClientRect().left + 56;
      const next = e.clientX - left;
      const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, next));
      setSidebarWidth(clamped);
      setUIPref('dream.sidebarWidth', clamped);
    };
    const onUp = () => {
      dragRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const toggleSideTab = (tab: DreamSideTab) => {
    if (sideOpen && sideTab === tab) {
      setSideOpen(false);
      return;
    }
    setSideTab(tab);
    setSideOpen(true);
  };

  const startDividerDrag = () => {
    dragRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const inputDisabled = phase !== 'active' || chatLoading;
  const sidebarPixels = sideOpen ? sidebarWidth : 0;
  const backgroundDataUrl = backgrounds[tone].dataUrl;
  const herAvatarDataUrl = characterAvatarDataUrl ?? defaultHerAvatarDataUrl;

  return (
    <div
      className={`dream-theme dream-theme--${tone}`}
      data-dream-phase="on"
      role="dialog"
      aria-modal="true"
      aria-label="梦境"
      style={{
        '--dream-chat-font-size': `${appearance.chatFontSize}px`,
        '--dream-theme-font-size': `${appearance.themeFontSize}px`,
        '--dream-theme-font-scale': appearance.themeFontSize / 14,
        '--dream-background-blur': `${appearance.backgroundBlur}px`,
        '--dt-flower-dandelion': appearance.accentColor,
        '--dream-accent': appearance.accentColor,
        ...(loadedFontFamily ? {
          '--font-serif': loadedFontFamily,
          '--font-mono': loadedFontFamily,
        } : {}),
        ...(tone === 'day' ? appearance.colorOverridesDay : appearance.colorOverridesNight),
      } as CSSProperties}
    >
      <div className="dream-theme__canvas" />
      <div className="dream-theme__mist" />

      <div
        ref={shellRef}
        className="dream-theme__shell"
        style={{
          '--dream-sidebar-w': `${sidebarPixels}px`,
          '--dream-divider-w': sideOpen ? '5px' : '0px',
        } as CSSProperties}
      >
        <DreamRibbon
          sideOpen={sideOpen}
          sideTab={sideTab}
          openModal={openModal}
          tone={tone}
          onTab={toggleSideTab}
          onModal={setOpenModal}
          onToneToggle={() => setTone(t => { const next = t === 'day' ? 'night' : 'day'; setUIPref('dream.tone', next); return next; })}
        />

        {sideOpen && (
          <>
            <DreamSidePane
              tab={sideTab}
              dreamState={dreamState}
              herDataUrl={herAvatarDataUrl}
              onClose={() => setSideOpen(false)}
            />
            <div
              className="dream-theme__divider"
              onMouseDown={startDividerDrag}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整梦境侧栏宽度"
            />
          </>
        )}

        <section
          className="dream-theme__chat"
          aria-label="梦境对话"
        >
          {backgroundDataUrl && (
            <div
              className="dream-theme__chat-background"
              style={{ backgroundImage: `url("${backgroundDataUrl}")` }}
              aria-hidden="true"
            />
          )}
          <DreamControlBar dreamState={dreamState} phase={phase} herDataUrl={herAvatarDataUrl} onWake={handleWake} />

          {/* State-specific content */}
          {phase === 'loading' && (
            <div className="dream-theme__stage">
              {stateError ? (
                <div className="mono" style={{ fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', color: 'oklch(0.52 0.14 20)', letterSpacing: 1 }}>
                  连接失败：{stateError}
                </div>
              ) : (
                <span className="mono" style={{ fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-3)', letterSpacing: 1.5 }}>
                  载入中…
                </span>
              )}
            </div>
          )}

          {phase === 'ready' && (
            <div className="dream-theme__stage dream-theme__stage--ready">
              <div className="dream-theme__ready-copy">
                <div className="dream-theme__ready-kicker">DREAM ENTRANCE</div>
                <div className="dream-theme__ready-title">梦境入口已经打开</div>
                <div className="dream-theme__ready-text">进入后，对话会暂时停在更轻、更慢的地方。</div>
              </div>
              {phaseError && (
                <div className="mono" style={{ fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', color: 'oklch(0.52 0.14 20)', letterSpacing: 1 }}>
                  {phaseError}
                </div>
              )}
              <button
                type="button"
                className="dream-theme__enter"
                onClick={handleEnter}
              >
                进入梦境
              </button>
            </div>
          )}

          {phase === 'entering' && (
            <div className="dream-theme__stage">
              <span className="mono" style={{ fontSize: 'calc(11px * var(--dream-theme-font-scale, 1))', color: 'var(--dt-ink-3)', letterSpacing: 1.5 }}>
                坠入中…
              </span>
            </div>
          )}

          {(phase === 'active' || phase === 'ended') && (
            <>
              <DreamChatPanel
                messages={messages}
                loading={chatLoading}
                streamingActive={streamingActive}
                inputDisabled={inputDisabled || retentionText !== null}
                herDataUrl={herAvatarDataUrl}
                onSend={send}
                endedMessage={phase === 'ended' ? '梦境已关闭。按 WAKE 醒来。' : undefined}
              />
              {retentionText !== null && (
                <div className="dream-theme__retention-bar">
                  <button
                    type="button"
                    className="dream-theme__retention-btn dream-theme__retention-btn--stay"
                    onClick={handleRetentionStay}
                  >
                    留下
                  </button>
                  <button
                    type="button"
                    className="dream-theme__retention-btn dream-theme__retention-btn--leave"
                    onClick={handleRetentionLeave}
                  >
                    还是要醒来
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <DreamPrefsPane
        open={openModal === 'prefs'}
        dreamState={dreamState}
        entryMode={entryMode}
        scenarioScriptId={scenarioScriptId}
        appearance={appearance}
        onEntryModeChange={mode => {
          setEntryMode(mode);
          setUIPref('dream.entryMode', mode);
        }}
        onScenarioScriptIdChange={scriptId => {
          setScenarioScriptId(scriptId);
          setUIPref('dream.scenarioScriptId', scriptId);
        }}
        onAppearanceChange={updateAppearance}
        onClose={() => setOpenModal(null)}
      />
      <DreamHelpPanel
        open={openModal === 'help'}
        onClose={() => setOpenModal(null)}
      />
    </div>
  );
}

function DreamRibbon({
  sideOpen,
  sideTab,
  openModal,
  tone,
  onTab,
  onModal,
  onToneToggle,
}: {
  sideOpen: boolean;
  sideTab: DreamSideTab;
  openModal: DreamModal;
  tone: DreamTone;
  onTab: (tab: DreamSideTab) => void;
  onModal: (modal: DreamModal) => void;
  onToneToggle: () => void;
}) {
  return (
    <nav className="dream-ribbon" aria-label="梦境导航">
      <RibbonButton label="聊天" icon="chat" iconSize={16} active decorative compact />
      <div className="dream-ribbon__separator" />
      <div className="dream-ribbon__group">
        <RibbonButton label="动向" icon="wind" active={sideOpen && sideTab === 'flow'} onClick={() => onTab('flow')} />
        <RibbonButton label="状态" icon="pulse" active={sideOpen && sideTab === 'status'} onClick={() => onTab('status')} />
        <RibbonButton label="潜意识" icon="sparkle" active={sideOpen && sideTab === 'subconscious'} onClick={() => onTab('subconscious')} />
      </div>
      <div className="dream-ribbon__spacer" />
      <div className="dream-ribbon__group">
        <RibbonButton label="偏好" icon="settings" active={openModal === 'prefs'} onClick={() => onModal(openModal === 'prefs' ? null : 'prefs')} />
        <RibbonButton label="帮助" icon="spec" active={openModal === 'help'} onClick={() => onModal(openModal === 'help' ? null : 'help')} />
        <RibbonButton label={tone === 'day' ? '夜间' : '日间'} icon={tone === 'day' ? 'mood' : 'sparkle'} active={false} onClick={onToneToggle} />
      </div>
    </nav>
  );
}

function RibbonButton({ label, icon, iconSize = 18, active, decorative = false, compact = false, onClick }: {
  label: string;
  icon: string;
  iconSize?: number;
  active: boolean;
  decorative?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`dream-ribbon__button${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      aria-label={label}
      title={label}
      aria-disabled={decorative || undefined}
      onClick={onClick}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

function DreamSidePane({
  tab,
  dreamState,
  herDataUrl,
  onClose,
}: {
  tab: DreamSideTab;
  dreamState: any;
  herDataUrl: string | null;
  onClose: () => void;
}) {
  if (tab === 'flow') {
    return (
      <DreamSidebar
        dreamState={dreamState}
        herDataUrl={herDataUrl}
        onClose={onClose}
      />
    );
  }

  if (tab === 'status') {
    return (
      <DreamStatusSidebar
        dreamState={dreamState}
        onClose={onClose}
      />
    );
  }

  if (tab === 'subconscious') {
    return (
      <aside
        className="dream-theme__sidebar dream-theme__sidebar--subconscious"
        aria-label="梦境潜意识"
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div className="dream-side-placeholder__head">
          <div>
            <div className="dream-side-placeholder__title">潜意识</div>
            <div className="dream-side-placeholder__kicker">SUBCONSCIOUS</div>
          </div>
          <button type="button" className="dream-side-placeholder__close" onClick={onClose} aria-label="关闭侧栏">×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <SubHiddenStatePanel dreamState={dreamState} />
        </div>
      </aside>
    );
  }

  return null;
}
