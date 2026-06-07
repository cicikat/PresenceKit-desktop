/* ============================================================
 * ChatPanel — 聊天窗口
 * Phase 2c+: 按日文件懒加载历史，滚顶继续往前拉
 * ============================================================ */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Tag, Icon, Btn } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, FOCUS_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { avatarStore } from '../../../shared/avatars/store';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { sendChat, uploadDocument, desktopWake } from '../../../shared/api/backend';
import { loadChatLogDates, loadChatLogDay } from '../../../shared/api/backend';
import { getClientConfig } from '../../../shared/api/config';
import { wsClient } from '../../../shared/api/ws';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { publishPetSnapshot, summarizePetReply } from '../../../shared/pet/bridge';
import { TypingDots } from '../../../shared/ui/TypingDots';
import type { ChatLogEntry, UploadError, NarrativeSegment } from '../../../shared/api/types';
import { normalizeChatDisplayText } from '../chatDisplay';

function splitReply(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

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
  // message_segments correlation
  wsMsgId?: string;
  segments?: NarrativeSegment[];
  segmentedContent?: string;
}

let _msgIdCounter = 0;
function newId() { return `m-${Date.now()}-${++_msgIdCounter}`; }

// Module-level session guard: ChatPanel can remount mid-session (e.g. when Dream opens/closes).
// This flag ensures desktop_wake fires at most once per page/window session regardless of remounts.
let _desktopWakeFired = false;

// ── 历史加载状态 ─────────────────────────────────────────────────────────────

type HistoryStatus =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'empty' }
  | { kind: 'error'; category: 'network' | 'unauthorized' | 'malformed'; statusCode: number | null; detail: string };

// Rust returns "HTTP 401 Unauthorized" / "HTTP 403 Forbidden" via format!("HTTP {}", resp.status())
function classifyHistoryError(err: unknown): { category: 'network' | 'unauthorized' | 'malformed'; statusCode: number | null; detail: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const codeMatch = msg.match(/\bHTTP (\d{3})\b/);
  const statusCode = codeMatch ? parseInt(codeMatch[1], 10) : null;
  if (statusCode === 401 || statusCode === 403
    || lower.includes('unauthorized') || lower.includes('unauthenticated') || lower.includes('forbidden')) {
    return { category: 'unauthorized', statusCode, detail: msg };
  }
  if (lower.includes('json') || lower.includes('parse') || lower.includes('serde') || lower.includes('invalid')) {
    return { category: 'malformed', statusCode, detail: msg };
  }
  return { category: 'network', statusCode, detail: msg };
}

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
      const segments = splitReply(entry.assistant);
      segments.forEach((seg, idx) => {
        msgs.push({ id: newId(), role: 'assistant', text: seg, time: ts + 1 + idx });
      });
    }
  }
  return msgs;
}

function dividerMsg(dateStr: string): ChatMsg {
  return { id: newId(), role: 'divider', text: `── ${formatDateCN(dateStr)} ──`, time: 0 };
}

// ── UI 组件 ─────────────────────────────────────────────────────────────────

function iconForFilename(name: string): string {
  const lower = name.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(lower)) return 'attach';
  if (/\.(txt|md|docx|doc|pdf)$/.test(lower)) return 'attach';
  return 'attach';
}

function ChatAvatar({ hue, size = 40 }: any) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
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

function BreathingAvatar({
  engine,
  hue,
  size,
  dataUrl,
}: {
  engine: any;
  hue: number;
  size: number;
  dataUrl?: string | null;
}) {
  const elemRef = useRef<any>(null);

  useEffect(() => {
    let raf: number;
    const loop = (t: number) => {
      const mood = engine.get().mood;
      const cfg = MOOD_TABLE[mood];
      const scale = 1 + Math.sin(t / cfg.breathePeriod * Math.PI * 2) * cfg.breatheDepth * 0.7;
      if (elemRef.current) {
        elemRef.current.style.transform = `scale(${scale})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  if (dataUrl) {
    return (
      <img
        ref={elemRef}
        src={dataUrl}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', transition: 'transform 0.12s ease-out' }}
      />
    );
  }

  return (
    <div ref={elemRef} style={{ display: 'inline-flex', transition: 'transform 0.12s ease-out' }}>
      <ChatAvatar hue={hue} size={size} />
    </div>
  );
}

const Bubble = memo(function Bubble({ msg, currentHue, herDataUrl, youDataUrl, youVisible, assistantFontSize, userFontSize }: any) {
  const fromUser = msg.role === 'user';
  const hue = msg.moodHue ?? currentHue;
  const time = msg.time ? new Date(msg.time).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' }) : '';

  if (msg.role === 'divider') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 6px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
        <div className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-3)', letterSpacing: 1.5 }}>{msg.text}</div>
        <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
      </div>
    );
  }

  if (msg.role === 'raw_fallback' || msg.role === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'var(--ink-4)', letterSpacing: 0.8 }}>{msg.text}</span>
      </div>
    );
  }

  if (msg.role === 'no_more') {
    return (
      <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>没有更早的对话了。</span>
      </div>
    );
  }

  if (fromUser) {
    const attachmentMatch = msg.text.match(/^📎 (.+?)(?:\n([\s\S]*))?$/);
    const isAttachment = attachmentMatch !== null;
    const attachFilename = isAttachment ? attachmentMatch![1] : null;
    const attachNote = isAttachment ? (attachmentMatch![2] ?? '') : '';

    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: youVisible ? 8 : 0, padding: '8px 0' }}>
        <div style={{ maxWidth: '78%' }}>
          <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), letterSpacing: 1.4, color: 'var(--ink-3)', textAlign: 'right', marginBottom: 4 }}>
            YOU · {time}
          </div>
          <div style={{
            padding: '10px 14px',
            background: 'var(--ink)', color: 'var(--paper)',
            borderRadius: '6px 6px 1px 6px',
            fontSize: userFontSize, lineHeight: 1.55,
            boxShadow: '0 4px 12px oklch(0.30 0.04 60 / 0.18)',
            whiteSpace: 'pre-wrap',
          }}>
            {isAttachment ? (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px',
                  background: 'oklch(0.95 0.02 60 / 0.25)',
                  borderRadius: 4,
                  marginBottom: attachNote ? 6 : 0,
                }}>
                  <Icon name={iconForFilename(attachFilename!)} size={16} />
                  <span style={{ fontSize: userFontSize - 1, fontWeight: 500, opacity: 0.9 }}>{attachFilename}</span>
                </div>
                {attachNote && <div style={{ fontSize: userFontSize }}>{normalizeChatDisplayText(attachNote)}</div>}
              </div>
            ) : normalizeChatDisplayText(msg.text)}
          </div>
        </div>
        {youVisible && (
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--paper-edge)' }}>
            {youDataUrl ? (
              <img src={youDataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', background: 'var(--paper-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: chatThemeFontSize(14), fontWeight: 600, color: 'var(--ink-3)', fontFamily: 'var(--font-serif)' }}>Y</div>
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
          <img src={herDataUrl} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <ChatAvatar hue={hue} size={36} />
        )}
      </div>
      <div style={{ flex: 1, maxWidth: 'calc(100% - 60px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), letterSpacing: 1.4, color: 'var(--ink-3)' }}>HIM · {time}</span>
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
          fontSize: assistantFontSize, lineHeight: 1.65, color: 'var(--ink)',
          fontFamily: 'var(--font-serif)',
          whiteSpace: 'pre-wrap',
        }}>
          {msg.deleted && (
            <div style={{ textDecoration: 'line-through', opacity: 0.45, fontSize: assistantFontSize - 1.5, marginBottom: 4 }}>{normalizeChatDisplayText(msg.deleted)}</div>
          )}
          {normalizeChatDisplayText(msg.segmentedContent ?? msg.text)}
          {msg.meta && (
            <div className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-3)', marginTop: 6, letterSpacing: 0.8 }}>{msg.meta}</div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── 主组件 ──────────────────────────────────────────────────────────────────

export function ChatPanel({ engine, chatRectRef, headerVisible = true, chatFontSize = 14, dreamActive = false, characterAvatarDataUrl = null }: any) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [avatars, setAvatars] = useState(avatarStore.get());
  useEffect(() => avatarStore.subscribe(setAvatars), []);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 按日懒加载状态
  const availableDatesRef = useRef<string[]>([]);
  const loadedDatesRef = useRef<string[]>([]);
  const isLoadingMoreRef = useRef(false);
  const noMoreHistoryRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [noMoreHistory, setNoMoreHistory] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ kind: 'loading' });
  const [loadMoreError, setLoadMoreError] = useState<'network' | 'unauthorized' | 'malformed' | null>(null);

  const rootRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 已渲染的 turn_id,用于 WS 去重
  const processedTurnIdsRef = useRef<Set<string>>(new Set());

  // message_segments 关联：ws msg_id → 本地 ChatMsg id 列表
  const wsMsgIdToLocalIdsRef = useRef<Map<string, string[]>>(new Map());
  // message_segments 先于 channel_message 到达时的暂存
  const pendingSegmentsByMsgIdRef = useRef<Map<string, { content: string; segments: NarrativeSegment[] }>>(new Map());

  // desktopWake HTTP fallback: store reply here instead of rendering immediately.
  // WS channel_message is the primary render path; HTTP reply only renders if WS never arrives.
  const pendingWakeReplyRef = useRef<{ timerId: ReturnType<typeof setTimeout>; parts: string[] } | null>(null);

  // Dream 打开期间屏蔽 channel_message
  const dreamActiveRef = useRef(dreamActive);
  useEffect(() => { dreamActiveRef.current = dreamActive; }, [dreamActive]);

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
          setHistoryStatus({ kind: 'empty' });
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
        setHistoryStatus({ kind: 'ok' });

        // Phase 2B: 拉取重开问候，每次 window/page session 仅触发一次
        if (!_desktopWakeFired) {
          _desktopWakeFired = true;
          // history cursor: last loaded assistant timestamp from chat log (minute-granular, ms).
          // +60s safety margin compensates for chat log's HH:MM truncation vs backend's
          // second-precision time.time(), preventing Path A from re-surfacing the same
          // message as an "unreplayed trigger" on the next startup.
          const lastAssistantMsg = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
          const historyCursorSec = lastAssistantMsg ? lastAssistantMsg.time / 1000 + 60 : undefined;
          try {
            const wakeResp = await desktopWake(historyCursorSec);
            if (mounted && wakeResp.reply) {
              const parts = wakeResp.reply.split(/\n+/).map(s => s.trim()).filter(Boolean);
              console.log('[wake] HTTP response received, wsState:', wsClient.getState(), 'source:', wakeResp.source, 'segments:', parts.length, 'didAppendHttpReply: false (deferred)');
              // Do NOT render directly — WS channel_message is the primary render path.
              // Store as fallback and render only if WS never delivers within 5s.
              const timerId = setTimeout(() => {
                if (!pendingWakeReplyRef.current) return; // already handled by WS
                pendingWakeReplyRef.current = null;
                console.log('[wake] WS timeout — rendering HTTP fallback, wsState:', wsClient.getState(), 'didAppendHttpReply: true');
                setMessages(prev => [
                  ...prev,
                  ...parts.map((text, idx) => ({
                    id: newId(),
                    role: 'assistant' as const,
                    text,
                    time: Date.now() + idx,
                  })),
                ]);
              }, 5000);
              pendingWakeReplyRef.current = { timerId, parts };
            } else {
              console.log('[wake] HTTP response received, no reply, source:', wakeResp.source);
            }
          } catch (wakeErr) {
            console.warn('[chat] desktop_wake 失败:', wakeErr);
          }
        }
      } catch (err) {
        console.warn('[chat-log] 初始化失败:', err);
        if (mounted) setHistoryStatus({ kind: 'error', ...classifyHistoryError(err) });
      }
    }

    init();
    return () => {
      mounted = false;
      if (pendingWakeReplyRef.current) {
        clearTimeout(pendingWakeReplyRef.current.timerId);
        pendingWakeReplyRef.current = null;
      }
    };
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

    // 在 setIsLoadingMore(true) 之前读取高度：indicator 出现会增加高度，
    // 而 setMessages + setIsLoadingMore(false) 在 React 18 里合批 render，
    // RAF 触发时 indicator 已消失，所以 oldScrollHeight 必须在 indicator 出现前捕获。
    const scroll = scrollRef.current;
    const oldScrollHeight = scroll ? scroll.scrollHeight : 0;

    setLoadMoreError(null);
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const day = await loadChatLogDay(targetDate);
      const newMsgs = entriesToMsgs(targetDate, day.entries, day.raw_fallback);

      loadedDatesRef.current = [targetDate, ...loaded];

      const insertMsgs: ChatMsg[] = [];
      insertMsgs.push(...newMsgs);
      insertMsgs.push(dividerMsg(earliestLoaded));

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
      setLoadMoreError(classifyHistoryError(err).category);
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

  // ── 分段消息 timers ───────────────────────────────────────────────────────

  const pendingSegmentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      pendingSegmentTimersRef.current.forEach(clearTimeout);
      pendingSegmentTimersRef.current = [];
    };
  }, []);

  const scheduleAssistantSegments = useCallback((fullText: string, wsMsgId?: string) => {
    const textParts = splitReply(fullText);
    if (textParts.length === 0) return;
    publishPetSnapshot({
      thinking: false,
      latestAssistantText: summarizePetReply(fullText),
    });

    const m = engine.get();
    const moodHue = MOOD_HUE[m.mood];
    const moodLabel = MOOD_LABEL_EN[m.mood];

    // Check for pending stripped content from message_segments that arrived first
    const pending = wsMsgId ? pendingSegmentsByMsgIdRef.current.get(wsMsgId) : undefined;
    const strippedParts = pending ? splitReply(pending.content) : null;

    // Pre-generate ids so we can register them in the ref before setMessages resolves
    const localIds = textParts.map(() => newId());

    if (wsMsgId) {
      wsMsgIdToLocalIdsRef.current.set(wsMsgId, localIds);
      if (pending) pendingSegmentsByMsgIdRef.current.delete(wsMsgId);
    }

    const pushSeg = (idx: number) => {
      const text = textParts[idx];
      const segmentedContent = strippedParts
        ? (strippedParts[idx] ?? strippedParts[0])
        : undefined;
      setMessages(prev => [...prev, {
        id: localIds[idx],
        role: 'assistant' as const,
        text,
        moodHue,
        moodLabel,
        time: Date.now(),
        wsMsgId: wsMsgId && idx === 0 ? wsMsgId : undefined,
        segments: pending?.segments,
        segmentedContent,
      }]);
    };

    pushSeg(0);

    let cumDelay = 0;
    for (let i = 1; i < textParts.length; i++) {
      cumDelay += 100 + Math.random() * 900;
      const segIdx = i;
      const timer = setTimeout(() => {
        pushSeg(segIdx);
        pendingSegmentTimersRef.current = pendingSegmentTimersRef.current.filter(t => t !== timer);
      }, cumDelay);
      pendingSegmentTimersRef.current.push(timer);
    }
  }, [engine]);

  useEffect(() => {
    publishPetSnapshot({ thinking: loading });
  }, [loading]);

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

  // ── WS 连接 + channel_message / message_segments 订阅 ────────────────────

  useEffect(() => {
    let mounted = true;
    getClientConfig().then(cfg => {
      if (mounted) wsClient.connect(cfg.websocketBase);
    });

    const unsubMsg = wsClient.on('channel_message', ({ content, msg_id }) => {
      if (dreamActiveRef.current) return;
      // Cancel any pending HTTP wake fallback — WS is the primary render path.
      // This prevents the double-render where desktopWake HTTP reply and WS channel_message
      // both append the same assistant turn.
      if (pendingWakeReplyRef.current) {
        clearTimeout(pendingWakeReplyRef.current.timerId);
        pendingWakeReplyRef.current = null;
        console.log('[wake] WS channel_message arrived — cancelled HTTP fallback, msg_id:', msg_id, 'duplicateDropped: true');
      } else {
        console.log('[wake] WS channel_message received, msg_id:', msg_id, 'duplicateDropped: false');
      }
      scheduleAssistantSegments(content, msg_id);
    });

    const unsubSegs = wsClient.on('message_segments', ({ content, segments, msg_id }) => {
      const localIds = wsMsgIdToLocalIdsRef.current.get(msg_id);
      if (localIds && localIds.length > 0) {
        // Bubbles already exist — update their segmentedContent in place
        const strippedParts = splitReply(content);
        setMessages(prev => prev.map(m => {
          const idx = localIds.indexOf(m.id);
          if (idx === -1) return m;
          return {
            ...m,
            segments,
            segmentedContent: strippedParts[idx] ?? strippedParts[0] ?? m.text,
          };
        }));
      } else {
        // channel_message hasn't arrived yet — park it
        pendingSegmentsByMsgIdRef.current.set(msg_id, { content, segments });
      }
    });

    return () => {
      mounted = false;
      unsubMsg();
      unsubSegs();
    };
  }, [engine, scheduleAssistantSegments]);

  // ── 输入处理 ──────────────────────────────────────────────────────────────

  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInputChange = (v: string) => {
    setInput(v);
    engine.markInteraction();
    if (state.focus !== '看你打字') engine.applyStateUpdate({ focus: '看你打字' });
    if (inputTimer.current) clearTimeout(inputTimer.current);
    inputTimer.current = setTimeout(() => engine.applyStateUpdate({ focus: '看你' }), 2500);
  };

  const send = async () => {
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    setMessages(m => [...m, { id: newId(), role: 'user', text: t, time: Date.now() }]);
    engine.applyStateUpdate({ focus: '想事情' });
    setLoading(true);
    try {
      const { reply } = await sendChat(t);
      scheduleAssistantSegments(reply);
    } catch (err) {
      console.error('[chat] send 失败:', err);
      const msg = err instanceof Error ? err.message : String(err);
      const is409 = /\b409\b/.test(msg);
      setMessages(prev => [...prev, {
        id: newId(),
        role: 'system',
        text: is409 ? '（正在做梦中，请先退出梦境再聊天）' : `（连接失败：${msg}）`,
        time: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const doUpload = useCallback(async (filePath: string, filename: string) => {
    const userMessage = input.trim();
    const placeholderText = userMessage
      ? `📎 ${filename}\n${userMessage}`
      : `📎 ${filename}`;
    setMessages(prev => [...prev, {
      id: newId(), role: 'user', text: placeholderText, time: Date.now(),
    }]);
    setInput('');
    setLoading(true);
    try {
      const resp = await uploadDocument(filePath, userMessage);
      if (resp.turn_id) processedTurnIdsRef.current.add(resp.turn_id);
      scheduleAssistantSegments(resp.reply);
    } catch (err: any) {
      let msg = '上传失败';
      if (err && typeof err === 'object' && 'kind' in err) {
        const e = err as UploadError;
        switch (e.kind) {
          case 'size_limit':       msg = '文件超过 5MB 限制'; break;
          case 'unsupported_type': msg = '仅支持 .txt / .md / .docx / .png / .jpg / .gif / .webp'; break;
          case 'parse_failed':     msg = '文件解析失败，请检查内容'; break;
          case 'network':          msg = `网络错误：${e.message}`; break;
          default:                 msg = `上传失败：${e.message}`;
        }
      } else {
        msg = `上传失败：${String(err)}`;
      }
      setMessages(prev => [...prev, {
        id: newId(), role: 'system', text: `(${msg})`, time: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, scheduleAssistantSegments]);

  const onClickAttach = useCallback(async () => {
    setShowAttachMenu(false);
    let picked: string | null = null;
    try {
      const res = await open({
        multiple: false,
        filters: [{ name: '文档', extensions: ['txt', 'md', 'docx'] }],
      });
      if (typeof res === 'string') picked = res;
    } catch (err) {
      console.warn('[upload] 选择文件失败:', err);
      return;
    }
    if (!picked) return;
    const lower = picked.toLowerCase();
    if (!['.txt', '.md', '.docx'].some(ext => lower.endsWith(ext))) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'system', text: '(仅支持 .txt / .md / .docx)', time: Date.now(),
      }]);
      return;
    }
    const filename = picked.split(/[\\/]/).pop() || picked;
    doUpload(picked, filename);
  }, [doUpload]);

  const onClickImage = useCallback(async () => {
    setShowAttachMenu(false);
    let picked: string | null = null;
    try {
      const res = await open({
        multiple: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });
      if (typeof res === 'string') picked = res;
    } catch (err) {
      console.warn('[upload] 选择图片失败:', err);
      return;
    }
    if (!picked) return;
    const lower = picked.toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].some(ext => lower.endsWith(ext))) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'system', text: '(仅支持 .png / .jpg / .jpeg / .gif / .webp)', time: Date.now(),
      }]);
      return;
    }
    const filename = picked.split(/[\\/]/).pop() || picked;
    doUpload(picked, filename);
  }, [doUpload]);

  const handleDropPaths = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    const path = paths[0];
    const filename = path.split(/[\\/]/).pop() || path;
    const lower = filename.toLowerCase();
    const isDoc = /\.(txt|md|docx)$/.test(lower);
    const isImg = /\.(png|jpg|jpeg|gif|webp)$/.test(lower);
    if (!isDoc && !isImg) {
      const ext = filename.match(/\.[^.]+$/)?.[0] ?? '(无后缀)';
      setMessages(prev => [...prev, {
        id: newId(), role: 'system',
        text: `（不支持的文件类型：${ext}）`,
        time: Date.now(),
      }]);
      return;
    }
    if (paths.length > 1) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'system',
        text: `（只发送了第一个文件，其余 ${paths.length - 1} 个忽略）`,
        time: Date.now(),
      }]);
    }
    doUpload(path, filename);
  }, [doUpload]);

  const handleDropPathsRef = useRef(handleDropPaths);
  useEffect(() => { handleDropPathsRef.current = handleDropPaths; }, [handleDropPaths]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;
    (async () => {
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setIsDraggingOver(true);
        } else if (payload.type === 'leave') {
          setIsDraggingOver(false);
        } else if (payload.type === 'drop') {
          setIsDraggingOver(false);
          handleDropPathsRef.current(payload.paths);
        }
      });
      // If cleanup ran before await resolved (StrictMode double-invoke race),
      // unregister the listener immediately instead of storing it.
      if (cancelled) { unlisten(); } else { unlistenFn = unlisten; }
    })();
    return () => { cancelled = true; if (unlistenFn) unlistenFn(); };
  }, []);

  const currentHue = MOOD_HUE[state.mood];
  const herDataUrl = characterAvatarDataUrl ?? avatars.her.dataUrl;
  const youDataUrl = avatars.you.dataUrl;
  const youVisible = avatars.you.visible;
  const fontSizes = { assistant: chatFontSize, user: chatFontSize };

  return (
    <div ref={rootRef} style={{
      position: 'relative', height: '100%',
      display: 'flex', flexDirection: 'column',
      minWidth: 0,
      background: 'var(--paper)', overflow: 'hidden',
    }}>
      {/* HEADER */}
      {headerVisible && (
        <div style={{
          padding: '20px 28px 14px', borderBottom: '1px solid var(--paper-edge)',
          background: 'var(--paper)', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <BreathingAvatar engine={engine} hue={currentHue} size={50} dataUrl={herDataUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ margin: 0, fontSize: chatThemeFontSize(28), fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.4 }}>
                对话
              </h1>
              <span className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'var(--ink-3)', letterSpacing: 1.3 }}>
                CHAPTER · {new Date().toLocaleDateString('zh', { month: 'long', day: 'numeric' }).toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tag hue={currentHue}>{MOOD_LABEL_EN[state.mood]}</Tag>
              <Tag variant="outline">{FOCUS_LABEL_EN[state.focus] || state.focus.toUpperCase()}</Tag>
              <Tag variant="outline" hue={state.presence === 'active' ? 145 : state.presence === 'idle' ? 80 : 30}>
                {state.presence.toUpperCase()}
              </Tag>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Btn icon="settings" dense>偏好</Btn>
            <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-4)', letterSpacing: 1.4 }}>
              {messages.filter(m => m.role === 'user' || m.role === 'assistant').length} ENTRIES
            </span>
            {historyStatus.kind === 'loading' && (
              <span className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-4)', letterSpacing: 1 }}>载入中…</span>
            )}
            {historyStatus.kind === 'error' && (
              <span className="mono" title={historyStatus.detail} style={{ fontSize: chatThemeFontSize(9), color: 'oklch(0.52 0.14 20)', letterSpacing: 1, cursor: 'default' }}>
                历史 · {historyStatus.category === 'network' ? '网络错误'
                  : historyStatus.category === 'unauthorized' ? (historyStatus.statusCode != null ? String(historyStatus.statusCode) : '401')
                  : '格式异常'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* MESSAGES */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', padding: `8px ${youVisible ? 56 : 28}px 12px 28px`, background: 'var(--paper)' }}
      >
        {/* 初始加载中占位 */}
        {historyStatus.kind === 'loading' && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0 20px' }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>正在加载历史记录…</span>
          </div>
        )}

        {/* 顶部加载中提示 */}
        {isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>正在加载更早的对话…</span>
          </div>
        )}

        {/* loadMore 错误提示 */}
        {loadMoreError && !isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'oklch(0.52 0.14 20)', letterSpacing: 0.8 }}>
              {loadMoreError === 'network' ? '网络错误，历史未能继续加载' : loadMoreError === 'unauthorized' ? '401 · 无权读取历史' : '历史格式异常，已跳过'}
            </span>
          </div>
        )}

        {messages.map((m: ChatMsg) => (
          <Bubble
            key={m.id}
            msg={m}
            currentHue={currentHue}
            herDataUrl={herDataUrl}
            youDataUrl={youDataUrl}
            youVisible={youVisible}
            assistantFontSize={fontSizes.assistant}
            userFontSize={fontSizes.user}
          />
        ))}

        {(typing || loading) && (
          <div style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start' }}>
            <div style={{ paddingTop: 6 }}>
              <BreathingAvatar engine={engine} hue={currentHue} size={36} dataUrl={herDataUrl} />
            </div>
            <div style={{
              padding: '12px 16px', borderRadius: '2px 6px 6px 2px',
              background: 'var(--paper-2)',
              borderLeft: `3px solid oklch(0.55 0.13 ${currentHue})`,
              borderTop: '1px solid var(--paper-edge)',
              borderRight: '1px solid var(--paper-edge)',
              borderBottom: '1px solid var(--paper-edge)',
            }}>
              <TypingDots color="var(--ink-3)" />
            </div>
          </div>
        )}
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
              ['attach', '附加文件',   '.txt .md .docx',       'doc'],
              ['book',   '插入日记片段', '从他的日记中',          'close'],
              ['attach', '插入图片',    '.png .jpg .gif .webp', 'img'],
              ['leaf',   '从花园中取',  '已养成的物品',          'close'],
            ] as [string, string, string, string][]).map(([icon, label, sub, action]) => (
              <button key={label} onClick={
                action === 'doc' ? onClickAttach :
                action === 'img' ? onClickImage :
                () => setShowAttachMenu(false)
              } style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--ink)', textAlign: 'left', borderRadius: 4, fontFamily: 'inherit',
              }}
                onMouseEnter={e => (e.currentTarget as any).style.background = 'var(--paper-3)'}
                onMouseLeave={e => (e.currentTarget as any).style.background = 'transparent'}>
                <Icon name={icon} size={16} />
                <div>
                  <div style={{ fontSize: chatThemeFontSize(12.5), fontWeight: 500 }}>{label}</div>
                  <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 0.8 }}>{sub}</div>
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
              flex: 1, resize: 'none', width: '100%', minWidth: 0,
              padding: '11px 14px', borderRadius: 6,
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              color: 'var(--ink)', fontSize: chatFontSize, fontFamily: 'var(--font-serif)',
              outline: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5,
            }}
          />
          <button onClick={send} style={{
            height: 40, padding: '0 18px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--paper)',
            border: 'none', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: chatThemeFontSize(13),
            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5,
          }}>
            <Icon name="send" size={15} /> 寄出
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-4)', letterSpacing: 1.2 }}>
            ENTER 发送 · SHIFT+ENTER 换行
          </span>
          {state.wantToSpeak && (
            <span className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: `oklch(0.45 0.12 ${currentHue})`, letterSpacing: 1.2 }}>
              · 他想说什么…
            </span>
          )}
        </div>
      </div>

      {isDraggingOver && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'oklch(0.95 0.04 60 / 0.85)',
          border: '3px dashed oklch(0.55 0.13 60)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, pointerEvents: 'none',
          borderRadius: 'inherit',
        }}>
          <div className="serif" style={{
            fontSize: chatThemeFontSize(18), fontWeight: 600, color: 'var(--ink)',
            letterSpacing: 0.5,
          }}>
            松开发送文件
          </div>
        </div>
      )}
    </div>
  );
}
