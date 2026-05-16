/* ============================================================
 * ChatPanel — 聊天窗口
 * Phase 2c+: 按日文件懒加载历史，滚顶继续往前拉
 * ============================================================ */

import { useState, useEffect, useRef, useCallback } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Tag, Icon, Btn } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, ACTIVITY_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { avatarStore } from '../../../shared/avatars/store';
import { sendChat } from '../../../shared/api/backend';
import { loadChatLogDates, loadChatLogDay } from '../../../shared/api/backend';
import { wsClient } from '../../../shared/api/ws';
import type { ChatLogEntry } from '../../../shared/api/types';

// ── 日期工具 ────────────────────────────────────────────────────────────────

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

function formatDateCN(dateStr: string): string {
  const d = parseISO(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ── 消息类型 ────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'divider' | 'raw_fallback' | 'no_more';
  text: string;
  time: number;
  moodHue?: number;
  moodLabel?: string;
  deleted?: string;
  meta?: string;
}

let _msgIdCounter = 0;
function newId() { return `m-${Date.now()}-${++_msgIdCounter}`; }

// ── 把单日 entries 转成消息列表 ──────────────────────────────────────────────

function entriesToMsgs(dateStr: string, entries: ChatLogEntry[], rawFallback: boolean): ChatMsg[] {
  if (rawFallback) {
    return [{
      id: newId(), role: 'raw_fallback', text: `(${formatDateCN(dateStr)}：早期格式，无法显示)`, time: 0,
    }];
  }
  const msgs: ChatMsg[] = [];
  for (const entry of entries) {
    const [h, min] = entry.time.split(':').map(Number);
    const d = parseISO(dateStr);
    const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).getTime();

    if (entry.user) {
      msgs.push({ id: newId(), role: 'user', text: entry.user, time: ts });
    }
    if (entry.assistant) {
      msgs.push({ id: newId(), role: 'assistant', text: entry.assistant, time: ts + 1 });
    }
  }
  return msgs;
}

function dividerMsg(dateStr: string): ChatMsg {
  return { id: newId(), role: 'divider', text: `── ${formatDateCN(dateStr)} ──`, time: 0 };
}

// ── UI 组件 ─────────────────────────────────────────────────────────────────

function ChatAvatar({ hue, size = 40, scale = 1 }: any) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}
      style={{ transform: `scale(${scale})`, transition: 'transform 0.12s ease-out' }}>
      <defs>
        <radialGradient id={`cv-${Math.floor(hue)}-${size}`} cx="42%" cy="38%">
          <stop offset="0%" stopColor={`oklch(0.95 0.04 ${hue})`} />
          <stop offset="100%" stopColor={`oklch(0.75 0.07 ${hue})`} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#cv-${Math.floor(hue)}-${size})`} stroke={`oklch(0.50 0.06 ${hue} / 0.3)`} strokeWidth="0.8" />
      <circle cx="14.5" cy="19" r="2.2" fill={`oklch(0.22 0.05 ${hue})`} />
      <circle cx="25.5" cy="19" r="2.2" fill={`oklch(0.22 0.05 ${hue})`} />
      <path d="M 15 26 q 5 3 10 0" stroke={`oklch(0.30 0.05 ${hue})`} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Bubble({ msg, currentHue, breath, herDataUrl, youDataUrl, youVisible }: any) {
  const fromUser = msg.role === 'user';
  const hue = msg.moodHue ?? currentHue;
  const time = msg.time ? new Date(msg.time).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' }) : '';

  if (msg.role === 'divider') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 6px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1.5 }}>{msg.text}</div>
        <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
      </div>
    );
  }

  if (msg.role === 'raw_fallback' || msg.role === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: 0.8 }}>{msg.text}</span>
      </div>
    );
  }

  if (msg.role === 'no_more') {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: 0.8 }}>没有更早的对话了。</span>
      </div>
    );
  }

  if (fromUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: youVisible ? 8 : 0, padding: '8px 0' }}>
        <div style={{ maxWidth: '78%' }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--ink-3)', textAlign: 'right', marginBottom: 4 }}>
            YOU · {time}
          </div>
          <div style={{
            padding: '10px 14px',
            background: 'var(--ink)', color: 'var(--paper)',
            borderRadius: '6px 6px 1px 6px',
            fontSize: 13.5, lineHeight: 1.55,
            boxShadow: '0 4px 12px oklch(0.30 0.04 60 / 0.18)',
            whiteSpace: 'pre-wrap',
          }}>{msg.text}</div>
        </div>
        {youVisible && (
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--paper-edge)' }}>
            {youDataUrl ? (
              <img src={youDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-serif)' }}>Y</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start' }}>
      <div style={{ paddingTop: 14, flexShrink: 0 }}>
        {herDataUrl ? (
          <img src={herDataUrl} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', transform: `scale(${breath})`, transition: 'transform 0.12s ease-out' }} />
        ) : (
          <ChatAvatar hue={hue} size={36} scale={breath} />
        )}
      </div>
      <div style={{ flex: 1, maxWidth: 'calc(100% - 60px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--ink-3)' }}>HIM · {time}</span>
          {msg.moodLabel && <Tag hue={hue}>{msg.moodLabel}</Tag>}
        </div>
        <div style={{
          padding: '11px 15px',
          background: 'var(--paper-2)',
          borderLeft: `3px solid oklch(0.55 0.13 ${hue})`,
          borderTop: '1px solid var(--paper-edge)',
          borderRight: '1px solid var(--paper-edge)',
          borderBottom: '1px solid var(--paper-edge)',
          borderRadius: '2px 6px 6px 2px',
          fontSize: 14, lineHeight: 1.65, color: 'var(--ink)',
          fontFamily: 'var(--font-serif)',
          whiteSpace: 'pre-wrap',
        }}>
          {msg.deleted && (
            <div style={{ textDecoration: 'line-through', opacity: 0.45, fontSize: 12.5, marginBottom: 4 }}>{msg.deleted}</div>
          )}
          {msg.text}
          {msg.meta && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 6, letterSpacing: 0.8 }}>{msg.meta}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

export function ChatPanel({ engine, chatRectRef, headerVisible = true }: any) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [avatars, setAvatars] = useState(avatarStore.get());
  useEffect(() => avatarStore.subscribe(setAvatars), []);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // 按日懒加载状态
  const availableDatesRef = useRef<string[]>([]);
  const loadedDatesRef = useRef<string[]>([]);
  const isLoadingMoreRef = useRef(false);
  const noMoreHistoryRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [noMoreHistory, setNoMoreHistory] = useState(false);

  const rootRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── 启动加载 ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const datesResp = await loadChatLogDates();
        if (!mounted) return;
        availableDatesRef.current = datesResp.dates; // 倒序，最新在前

        const today = todayStr();
        const dates = availableDatesRef.current;

        if (dates.length === 0) {
          setMessages([]);
          noMoreHistoryRef.current = true;
          setNoMoreHistory(true);
          return;
        }

        let msgs: ChatMsg[] = [];
        let firstDate: string | null = null;

        if (dates.includes(today)) {
          // 拉今日
          const day = await loadChatLogDay(today);
          if (!mounted) return;
          msgs = entriesToMsgs(today, day.entries, day.raw_fallback);
          loadedDatesRef.current = [today];
          firstDate = today;

          // 不够 10 条，兜底拉前一天
          if (msgs.filter(m => m.role === 'user' || m.role === 'assistant').length < 10) {
            const todayIdx = dates.indexOf(today);
            const prevDate = dates[todayIdx + 1];
            if (prevDate) {
              const prevDay = await loadChatLogDay(prevDate);
              if (!mounted) return;
              const prevMsgs = entriesToMsgs(prevDate, prevDay.entries, prevDay.raw_fallback);
              msgs = [...prevMsgs, dividerMsg(today), ...msgs];
              loadedDatesRef.current = [prevDate, today];
              firstDate = prevDate;
            }
          }
        } else {
          // 今天没聊，直接拉最近一天
          const recentDate = dates[0];
          const day = await loadChatLogDay(recentDate);
          if (!mounted) return;
          msgs = entriesToMsgs(recentDate, day.entries, day.raw_fallback);
          loadedDatesRef.current = [recentDate];
          firstDate = recentDate;
        }

        // 检查是否还有更早的
        if (firstDate) {
          const firstIdx = availableDatesRef.current.indexOf(firstDate);
          if (firstIdx >= availableDatesRef.current.length - 1) {
            noMoreHistoryRef.current = true;
            setNoMoreHistory(true);
            msgs = [{ id: newId(), role: 'no_more', text: '', time: 0 }, ...msgs];
          }
        }

        setMessages(msgs);
      } catch (err) {
        console.warn('[chat-log] 初始化失败:', err);
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ── 滚顶懒加载 ───────────────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || noMoreHistoryRef.current) return;

    const dates = availableDatesRef.current;
    const loaded = loadedDatesRef.current;
    if (loaded.length === 0 || dates.length === 0) return;

    const earliestLoaded = loaded[0];
    const earliestIdx = dates.indexOf(earliestLoaded);
    const targetIdx = earliestIdx + 1;

    if (targetIdx >= dates.length) {
      noMoreHistoryRef.current = true;
      setNoMoreHistory(true);
      setMessages(prev => {
        if (prev[0]?.role === 'no_more') return prev;
        return [{ id: newId(), role: 'no_more', text: '', time: 0 }, ...prev];
      });
      return;
    }

    const targetDate = dates[targetIdx];

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const day = await loadChatLogDay(targetDate);
      const newMsgs = entriesToMsgs(targetDate, day.entries, day.raw_fallback);

      loadedDatesRef.current = [targetDate, ...loaded];

      // 找到当前最早的非 no_more 消息对应的日期，需要在前面插入分隔条
      const insertMsgs: ChatMsg[] = [];
      insertMsgs.push(...newMsgs);
      // 在新旧之间加分隔条（显示旧的最早已加载日期）
      insertMsgs.push(dividerMsg(earliestLoaded));

      const scroll = scrollRef.current;
      const oldScrollHeight = scroll ? scroll.scrollHeight : 0;

      setMessages(prev => {
        // 移除顶部可能存在的 no_more 占位
        const withoutNoMore = prev[0]?.role === 'no_more' ? prev.slice(1) : prev;
        return [...insertMsgs, ...withoutNoMore];
      });

      // 补偿滚动位置
      requestAnimationFrame(() => {
        if (scroll) {
          const newScrollHeight = scroll.scrollHeight;
          scroll.scrollTop = newScrollHeight - oldScrollHeight + scroll.scrollTop;
        }
      });

      // 检查是否到头了
      if (targetIdx >= dates.length - 1) {
        noMoreHistoryRef.current = true;
        setNoMoreHistory(true);
        setMessages(prev => {
          if (prev[0]?.role === 'no_more') return prev;
          return [{ id: newId(), role: 'no_more', text: '', time: 0 }, ...prev];
        });
      }
    } catch (err) {
      console.warn('[chat-log] loadMore 失败:', err);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  const onScroll = useCallback(() => {
    if (!scrollRef.current) return;
    if (scrollRef.current.scrollTop < 200) {
      loadMore();
    }
  }, [loadMore]);

  // ── 注册聊天区位置 ────────────────────────────────────────────────────────

  useEffect(() => {
    const update = () => {
      if (rootRef.current && chatRectRef) chatRectRef.current = rootRef.current.getBoundingClientRect();
    };
    update();
    window.addEventListener('resize', update);
    const h = setInterval(update, 1000);
    return () => { window.removeEventListener('resize', update); clearInterval(h); };
  }, []);

  // ── 头像呼吸动画 ──────────────────────────────────────────────────────────

  const [breathe, setBreathe] = useState(1);
  useEffect(() => {
    let raf: number;
    const loop = (t: number) => {
      const m = engine.get().mood;
      const cfg = MOOD_TABLE[m];
      setBreathe(1 + Math.sin(t / cfg.breathePeriod * Math.PI * 2) * cfg.breatheDepth * 0.7);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  // ── 自动滚到底（仅新消息 append 时）──────────────────────────────────────

  const prevLengthRef = useRef(0);
  useEffect(() => {
    const cur = messages.length;
    const prev = prevLengthRef.current;
    prevLengthRef.current = cur;
    // 只有消息增加（append）才滚底，prepend 时不滚
    if (cur > prev && scrollRef.current) {
      const s = scrollRef.current;
      // 只有当用户已在底部附近时才自动滚底
      const nearBottom = s.scrollHeight - s.scrollTop - s.clientHeight < 150;
      if (nearBottom || prev === 0) {
        s.scrollTop = s.scrollHeight;
      }
    }
  }, [messages.length, typing]);

  // ── wantToSpeak → typing 闪现 ────────────────────────────────────────────

  useEffect(() => {
    if (state.wantToSpeak) {
      setTyping(true);
      const t = setTimeout(() => setTyping(false), 2800);
      return () => clearTimeout(t);
    }
  }, [state.wantToSpeak]);

  // ── WS 连接 + channel_message 订阅 ───────────────────────────────────────

  useEffect(() => {
    wsClient.connect('ws://127.0.0.1:8080/ws/desktop');
    return wsClient.on('channel_message', (content) => {
      const m = engine.get();
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: content,
        moodHue: MOOD_HUE[m.mood],
        moodLabel: MOOD_LABEL_EN[m.mood],
        time: Date.now(),
      }]);
    });
  }, [engine]);

  // ── 输入处理 ──────────────────────────────────────────────────────────────

  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInputChange = (v: string) => {
    setInput(v);
    engine.markInteraction();
    if (state.activity !== '看你打字') engine.applyStateUpdate({ activity: '看你打字' });
    if (inputTimer.current) clearTimeout(inputTimer.current);
    inputTimer.current = setTimeout(() => engine.applyStateUpdate({ activity: '看你' }), 2500);
  };

  const send = async () => {
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    setMessages(m => [...m, { id: newId(), role: 'user', text: t, time: Date.now() }]);
    engine.applyStateUpdate({ activity: '想事情' });
    setLoading(true);
    try {
      const { reply } = await sendChat(t);
      const m = engine.get();
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'assistant',
        text: reply,
        moodHue: MOOD_HUE[m.mood],
        moodLabel: MOOD_LABEL_EN[m.mood],
        time: Date.now(),
      }]);
    } catch (err) {
      console.error('[chat] send 失败:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'system',
        text: `（连接失败：${msg}）`,
        time: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const currentHue = MOOD_HUE[state.mood];
  const herDataUrl = avatars.her.dataUrl;
  const youDataUrl = avatars.you.dataUrl;
  const youVisible = avatars.you.visible;

  return (
    <div ref={rootRef} style={{
      position: 'relative', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)', overflow: 'hidden',
    }}>
      {/* HEADER */}
      {headerVisible && (
        <div style={{
          padding: '20px 28px 14px', borderBottom: '1px solid var(--paper-edge)',
          background: 'var(--paper)', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          {herDataUrl ? (
            <img src={herDataUrl} style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', transform: `scale(${breathe})`, transition: 'transform 0.12s ease-out', flexShrink: 0 }} />
          ) : (
            <ChatAvatar hue={currentHue} size={50} scale={breathe} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.4 }}>
                对话
              </h1>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 1.3 }}>
                CHAPTER · {new Date().toLocaleDateString('zh', { month: 'long', day: 'numeric' }).toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tag hue={currentHue}>{MOOD_LABEL_EN[state.mood]}</Tag>
              <Tag variant="outline">{ACTIVITY_LABEL_EN[state.activity] || state.activity.toUpperCase()}</Tag>
              <Tag variant="outline" hue={state.presence === 'active' ? 145 : state.presence === 'idle' ? 80 : 30}>
                {state.presence.toUpperCase()}
              </Tag>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Btn icon="settings" dense>偏好</Btn>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 1.4 }}>
              {messages.filter(m => m.role === 'user' || m.role === 'assistant').length} ENTRIES
            </span>
          </div>
        </div>
      )}

      {/* MESSAGES */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', padding: `8px ${youVisible ? 56 : 28}px 12px 28px`, background: 'var(--paper)' }}
      >
        {/* 顶部加载中提示 */}
        {isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: 0.8 }}>正在加载更早的对话…</span>
          </div>
        )}

        {messages.map((m: ChatMsg) => (
          <Bubble
            key={m.id}
            msg={m}
            currentHue={currentHue}
            breath={breathe}
            herDataUrl={herDataUrl}
            youDataUrl={youDataUrl}
            youVisible={youVisible}
          />
        ))}

        {(typing || loading) && (
          <div style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start' }}>
            <div style={{ paddingTop: 6 }}>
              {herDataUrl ? (
                <img src={herDataUrl} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', transform: `scale(${breathe})`, transition: 'transform 0.12s ease-out' }} />
              ) : (
                <ChatAvatar hue={currentHue} size={36} scale={breathe} />
              )}
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: '2px 6px 6px 2px',
              background: 'var(--paper-2)',
              borderLeft: `3px solid oklch(0.55 0.13 ${currentHue})`,
              borderTop: '1px solid var(--paper-edge)',
              borderRight: '1px solid var(--paper-edge)',
              borderBottom: '1px solid var(--paper-edge)',
            }}>
              <span className="typing-dots"><i /><i /><i /></span>
            </div>
          </div>
        )}
        <style>{`
          .typing-dots i { display:inline-block; width:5px; height:5px; border-radius:50%;
            background:var(--ink-3); margin:0 2px;
            animation:dot 1.2s ease-in-out infinite; }
          .typing-dots i:nth-child(2){ animation-delay:0.18s }
          .typing-dots i:nth-child(3){ animation-delay:0.36s }
          @keyframes dot { 0%,100%{ opacity:0.3; transform:translateY(0) } 50%{ opacity:1; transform:translateY(-3px) } }
        `}</style>
      </div>

      {/* INPUT */}
      <div style={{ position: 'relative', padding: 18, borderTop: '1px solid var(--paper-edge)', background: 'var(--paper-2)' }}>
        {showAttachMenu && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 18, marginBottom: 8,
            background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 6,
            padding: 6, minWidth: 200,
            boxShadow: '0 12px 32px oklch(0.30 0.04 60 / 0.20)', zIndex: 10,
          }}>
            {([
              ['attach', '附加文件',   '.pdf .png .jpg'],
              ['book',   '插入日记片段', '从她的日记中'],
              ['leaf',   '从花园中取',  '已养成的物品'],
              ['sparkle','设置心情',   '手动注入状态'],
            ] as [string, string, string][]).map(([icon, label, sub]) => (
              <button key={label} onClick={() => setShowAttachMenu(false)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--ink)', textAlign: 'left', borderRadius: 4, fontFamily: 'inherit',
              }}
                onMouseEnter={e => (e.currentTarget as any).style.background = 'var(--paper-3)'}
                onMouseLeave={e => (e.currentTarget as any).style.background = 'transparent'}>
                <Icon name={icon} size={16} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <button onClick={() => setShowAttachMenu(s => !s)} style={{
            width: 40, height: 40, borderRadius: 6,
            background: showAttachMenu ? 'var(--ink)' : 'var(--paper)',
            color: showAttachMenu ? 'var(--paper)' : 'var(--ink)',
            border: '1px solid var(--paper-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <Icon name="plus" size={18} />
          </button>
          <textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="写点什么…"
            rows={1}
            style={{
              flex: 1, resize: 'none', padding: '11px 14px', borderRadius: 6,
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-serif)',
              outline: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5,
            }}
          />
          <button onClick={send} style={{
            height: 40, padding: '0 18px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--paper)',
            border: 'none', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5,
          }}>
            <Icon name="send" size={15} /> 寄出
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 1.2 }}>
            ENTER 发送 · SHIFT+ENTER 换行
          </span>
          {state.wantToSpeak && (
            <span className="mono" style={{ fontSize: 9.5, color: `oklch(0.45 0.12 ${currentHue})`, letterSpacing: 1.2 }}>
              · 他想说什么…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
