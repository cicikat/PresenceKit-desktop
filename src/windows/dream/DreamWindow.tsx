import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { dreamEnter, dreamExit } from '../../shared/api/dream';
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
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import { avatarStore } from '../../shared/avatars/store';
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
  onClose: () => void;
}

export function DreamWindow({ onClose }: DreamWindowProps) {
  const { dreamState, stateError, refresh: refreshState } = useDreamState();
  const [phase, setPhase] = useState<WindowPhase>('loading');
  const [phaseError, setPhaseError] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<DreamSideTab>('flow');
  const [openModal, setOpenModal] = useState<DreamModal>(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => getUIPref('dream.sidebarWidth', SIDEBAR_DEFAULT));
  const [tone, setTone] = useState<DreamTone>(() => getUIPref('dream.tone', 'day'));
  const [appearance, setAppearance] = useState<DreamAppearance>(() => loadDreamAppearance());
  const [backgrounds, setBackgrounds] = useState(() => avatarStore.get().dreamBackgrounds);
  const [loadedFontFamily, setLoadedFontFamily] = useState<string | null>(null);
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

  const { messages, loading: chatLoading, send, addSystemMsg } = useDreamChat(handleExited);

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

  const handleEnter = async () => {
    setPhase('entering');
    setPhaseError(null);
    try {
      const resp = await dreamEnter();
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
      const msg = String(e);
      const m = msg.match(/\bHTTP (\d+)/);
      const httpStatus = m ? parseInt(m[1], 10) : null;
      if (httpStatus === 409) setPhaseError(`当前状态无法进入梦境（${msg}）`);
      else if (httpStatus === 503) setPhaseError(`服务暂不可用（${msg}）`);
      else setPhaseError(`连接失败：${msg}`);
      setPhase('ready');
    }
  };

  const handleWake = useCallback(async () => {
    try { await dreamExit(); } catch { /* dreamExit always succeeds per spec */ }
    onClose();
  }, [onClose]);

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
          <DreamControlBar dreamState={dreamState} phase={phase} onWake={handleWake} />

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
            <DreamChatPanel
              messages={messages}
              loading={chatLoading}
              inputDisabled={inputDisabled}
              onSend={send}
              endedMessage={phase === 'ended' ? '梦境已关闭。按 WAKE 醒来。' : undefined}
            />
          )}
        </section>
      </div>

      <DreamPrefsPane
        open={openModal === 'prefs'}
        dreamState={dreamState}
        appearance={appearance}
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
  onClose,
}: {
  tab: DreamSideTab;
  dreamState: any;
  onClose: () => void;
}) {
  if (tab === 'flow') {
    return (
      <DreamSidebar
        dreamState={dreamState}
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
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          '--forest': 'transparent',
          '--forest-1': 'var(--dt-surface-deep)',
          '--forest-line': 'var(--dt-border-soft)',
          '--on-forest': 'var(--dt-ink)',
          '--on-forest-2': 'var(--dt-ink-3)',
          '--chat-theme-font-scale': 'var(--dream-theme-font-scale)',
        } as CSSProperties}
      >
        <div className="dream-side-placeholder__head">
          <div>
            <div className="dream-side-placeholder__title">潜意识</div>
            <div className="dream-side-placeholder__kicker">READ ONLY · HIDDEN STATE</div>
          </div>
          <button type="button" className="dream-side-placeholder__close" onClick={onClose} aria-label="关闭侧栏">×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <SubHiddenStatePanel />
        </div>
      </aside>
    );
  }

  return null;
}
