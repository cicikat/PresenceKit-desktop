import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import { dreamEnter, dreamExit } from '../../shared/api/dream';
import { useDreamState } from './hooks/useDreamState';
import { useDreamChat } from './hooks/useDreamChat';
import { DreamSidebar } from './components/DreamSidebar';
import { DreamControlBar } from './components/DreamControlBar';
import { DreamChatPanel } from './components/DreamChatPanel';
import { Icon } from '../chat/components/UIKit';
import { getUIPref, setUIPref } from '../../shared/uiPreferences';
import '../../features/dream/DreamTokens.css';

type WindowPhase = 'loading' | 'ready' | 'entering' | 'active' | 'ended';
type DreamSideTab = 'flow' | 'status' | 'subconscious' | 'prefs' | 'help';
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
  const [sidebarWidth, setSidebarWidth] = useState(() => getUIPref('dream.sidebarWidth', SIDEBAR_DEFAULT));
  const [tone, setTone] = useState<DreamTone>(() => getUIPref('dream.tone', 'day'));
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleWake(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleWake]);

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

  return (
    <div
      className={`dream-theme dream-theme--${tone}`}
      data-dream-phase="on"
      role="dialog"
      aria-modal="true"
      aria-label="梦境"
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
          tone={tone}
          onChat={() => setSideOpen(false)}
          onTab={toggleSideTab}
          onToneToggle={() => setTone(t => { const next = t === 'day' ? 'night' : 'day'; setUIPref('dream.tone', next); return next; })}
        />

        {sideOpen && (
          <>
            <DreamSidePane
              tab={sideTab}
              dreamState={dreamState}
              messages={messages}
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
          <DreamControlBar dreamState={dreamState} phase={phase} onWake={handleWake} />

          {/* State-specific content */}
          {phase === 'loading' && (
            <div className="dream-theme__stage">
              {stateError ? (
                <div className="mono" style={{ fontSize: 11, color: 'oklch(0.52 0.14 20)', letterSpacing: 1 }}>
                  连接失败：{stateError}
                </div>
              ) : (
                <span className="mono" style={{ fontSize: 11, color: 'var(--dt-ink-3)', letterSpacing: 1.5 }}>
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
                <div className="mono" style={{ fontSize: 11, color: 'oklch(0.52 0.14 20)', letterSpacing: 1 }}>
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
              <span className="mono" style={{ fontSize: 11, color: 'var(--dt-ink-3)', letterSpacing: 1.5 }}>
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
    </div>
  );
}

function DreamRibbon({
  sideOpen,
  sideTab,
  tone,
  onChat,
  onTab,
  onToneToggle,
}: {
  sideOpen: boolean;
  sideTab: DreamSideTab;
  tone: DreamTone;
  onChat: () => void;
  onTab: (tab: DreamSideTab) => void;
  onToneToggle: () => void;
}) {
  return (
    <nav className="dream-ribbon" aria-label="梦境导航">
      <RibbonButton label="聊天" icon="chat" active={!sideOpen} onClick={onChat} />
      <div className="dream-ribbon__group">
        <RibbonButton label="动向" icon="wind" active={sideOpen && sideTab === 'flow'} onClick={() => onTab('flow')} />
        <RibbonButton label="状态" icon="pulse" active={sideOpen && sideTab === 'status'} onClick={() => onTab('status')} />
        <RibbonButton label="潜意识" icon="sparkle" active={sideOpen && sideTab === 'subconscious'} onClick={() => onTab('subconscious')} />
      </div>
      <div className="dream-ribbon__spacer" />
      <div className="dream-ribbon__group">
        <RibbonButton label="偏好" icon="settings" active={sideOpen && sideTab === 'prefs'} onClick={() => onTab('prefs')} />
        <RibbonButton label="帮助" icon="spec" active={sideOpen && sideTab === 'help'} onClick={() => onTab('help')} />
        <RibbonButton label={tone === 'day' ? '夜间' : '日间'} icon={tone === 'day' ? 'mood' : 'sparkle'} active={false} onClick={onToneToggle} />
      </div>
    </nav>
  );
}

function RibbonButton({ label, icon, active, onClick }: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dream-ribbon__button${active ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function DreamSidePane({
  tab,
  dreamState,
  messages,
  onClose,
}: {
  tab: DreamSideTab;
  dreamState: any;
  messages: any[];
  onClose: () => void;
}) {
  if (tab === 'flow') {
    return (
      <DreamSidebar
        dreamState={dreamState}
        messages={messages}
        onClose={onClose}
      />
    );
  }

  const titleMap: Record<DreamSideTab, string> = {
    flow: '动向',
    status: '状态',
    subconscious: '潜意识',
    prefs: '偏好',
    help: '帮助',
  };

  const bodyMap: Record<Exclude<DreamSideTab, 'flow'>, string> = {
    status: '这里会接入梦境状态的更细指标，例如情绪张力、场景稳定度、退出倾向和最近一次状态变化。',
    subconscious: '这里会接入 symbolic_anchors、scene_state 的长期聚合，以及未来梦境记忆/潜意识线索。',
    prefs: '这里会接入梦境偏好，例如 lorebook、遗忘策略、保留印象、日夜外观等本地设置。',
    help: '这里会放梦境模式说明、状态含义、快捷键和后续调试入口。',
  };

  const key = tab as Exclude<DreamSideTab, 'flow'>;

  return (
    <aside className="dream-theme__sidebar dream-theme__sidebar--placeholder" aria-label={`梦境${titleMap[tab]}`}>
      <div className="dream-side-placeholder__head">
        <div>
          <div className="dream-side-placeholder__title">{titleMap[tab]}</div>
          <div className="dream-side-placeholder__kicker">COMING SOON</div>
        </div>
        <button type="button" className="dream-side-placeholder__close" onClick={onClose} aria-label="关闭侧栏">×</button>
      </div>
      <div className="dream-side-placeholder__body">
        {bodyMap[key]}
      </div>
    </aside>
  );
}
