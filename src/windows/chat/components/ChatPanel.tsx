/* ============================================================
 * ChatPanel — 聊天窗口
 * Phase 2c+: 按日文件懒加载历史，滚顶继续往前拉
 * ============================================================ */

import { useState, useEffect, useRef, useCallback, memo, type ReactNode } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Tag, Icon, Btn } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, FOCUS_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { avatarStore } from '../../../shared/avatars/store';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { sendChat, uploadDocument, desktopWake } from '../../../shared/api/backend';
import { shouldSkipDesktopWake, markDesktopWakeFired } from '../../../shared/desktopWakeGate';
import { useVoiceInput } from '../../../shared/voice/useVoiceInput';
import { getDesktopTtsEnabled } from '../../../shared/api/runtimeSettings';
import { VoiceMessageBar } from './VoiceMessageBar';
import { loadChatLogDates, loadChatLogDay } from '../../../shared/api/backend';
import { getClientConfig } from '../../../shared/api/config';
import { wsClient } from '../../../shared/api/ws';
import { notifyOnMessage } from '../../../shared/api/notify';
import { getActiveCharacterName } from '../../../shared/activeCharacter';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import { useI18n } from '../../../shared/i18n';
import { publishPetSnapshot } from '../../../shared/pet/bridge';
import { TypingDots } from '../../../shared/ui/TypingDots';
import type { ChatLogEntry, UploadError, NarrativeSegment } from '../../../shared/api/types';
import { normalizeChatDisplayText } from '../chatDisplay';
import { renderInlineStyled } from '../inlineStyle';
import {
  findRenderedFallback,
  hasRegisteredMessage,
  matchesCorrelation,
  prunePendingSegments,
  pruneRenderedFallbacks,
  setBoundedMapEntry,
} from '../correlation';

function splitReply(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

// Strip leading parenthetical action/narration blocks so that raw HTTP reply and
// cleaned message_segments content can be matched against each other for dedup.
function normalizeForDedup(text: string): string {
  return text
    .replace(/^([（(][^）)\n]*[）)]\s*)+/, '')
    .replace(/^(\*[^*\n]*\*\s*)+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .toLowerCase();
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
  speakerId?: string; // char_id; absent = owner (right bubble)
  moodHue?: number;
  moodLabel?: string;
  deleted?: string;
  meta?: string;
  // message_segments correlation
  wsMsgId?: string;
  turnId?: string;
  segments?: NarrativeSegment[];
  segmentedContent?: string;
  // 流式气泡：token 逐字到达时为 true，canonical channel_message 到达后清除
  isStreaming?: boolean;
  // 流结束（stream_end 到达）但 canonical 尚未替换：光标关闭，内容仍为原始 token
  streamingDone?: boolean;
}

interface FallbackRecord {
  sourceKind: 'send' | 'wake' | 'upload';
  msgId?: string;
  normalizedHash: string;
  renderedAt: number;
  renderedMsgIds: string[];
}

interface RealityChannelMessage {
  content: string;
  msg_id: string;
  source?: string;
}

interface PendingRealitySegments {
  content: string;
  segments: NarrativeSegment[];
  receivedAt: number;
}

interface ParkedRealityMessage extends RealityChannelMessage {
  pendingSegments?: PendingRealitySegments;
}

const MAX_PARKED_REALITY_MESSAGES = 50;
const MAX_WS_MSG_ID_MAPPINGS = 200;

function pruneStalePendingSegments(map: Map<string, PendingRealitySegments>, now = Date.now()) {
  prunePendingSegments(map, now);
}

let _msgIdCounter = 0;
function newId() { return `m-${Date.now()}-${++_msgIdCounter}`; }

function responseMsgId(response: { msg_id?: string; turn_id?: string }): string | undefined {
  return response.msg_id || response.turn_id || undefined;
}

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
    const ts = typeof entry.ts === 'number'
      ? entry.ts * 1000
      : (() => {
        const [h, min] = entry.time.split(':').map(Number);
        const d = parseISO(dateStr);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min).getTime();
      })();

    if (entry.user) {
      msgs.push({ id: newId(), role: 'user', text: entry.user, time: ts, turnId: entry.turn_id });
    }
    if (entry.assistant) {
      const segments = splitReply(entry.assistant);
      segments.forEach((seg) => {
        msgs.push({ id: newId(), role: 'assistant', text: seg, time: ts, turnId: entry.turn_id });
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

// ── 流式气泡渲染 ─────────────────────────────────────────────────────────────

function StreamTagBox({ raw, done }: { raw: string; done: boolean }) {
  // 把 <say>, </do> 等标签以小徽章形式展示；half-tag（done=false）显示为待完成状态
  const label = raw.replace(/^<\/?/, '').replace(/>$/, '');
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.75em',
      padding: '1px 5px',
      margin: '0 2px',
      borderRadius: 'var(--radius-xs)',
      background: done ? 'var(--paper-3)' : 'oklch(0.88 0.04 60 / 0.6)',
      color: 'var(--ink-3)',
      opacity: done ? 0.7 : 0.5,
      fontFamily: 'var(--font-mono, monospace)',
      letterSpacing: 0,
      verticalAlign: 'middle',
      animation: done ? undefined : 'streaming-pulse 1s ease-in-out infinite',
    }}>{label}</span>
  );
}

function renderStreamingContent(text: string, isDone: boolean): ReactNode {
  if (!text) return isDone ? null : <TypingDots color="var(--ink-3)" />;

  const nodes: ReactNode[] = [];
  let buf = '';
  let inTag = false;
  let tagBuf = '';
  let key = 0;

  for (const ch of text) {
    if (!inTag && ch === '<') {
      if (buf) { nodes.push(<span key={key++}>{buf}</span>); buf = ''; }
      inTag = true; tagBuf = '<';
    } else if (inTag && ch === '>') {
      tagBuf += '>';
      // Inline style tags (<hl>, <big>, <sm>) are absorbed into the text buffer
      // rather than shown as badge widgets — they'll be styled after streaming ends.
      const tagLabel = tagBuf.replace(/^<\/?/, '').replace(/>$/, '').toLowerCase();
      if (tagLabel === 'hl' || tagLabel === 'big' || tagLabel === 'sm') {
        buf += tagBuf;
      } else {
        nodes.push(<StreamTagBox key={key++} raw={tagBuf} done />);
      }
      inTag = false; tagBuf = '';
    } else if (inTag) {
      tagBuf += ch;
    } else {
      buf += ch;
    }
  }

  // 未闭合 tag（流还在进行中）→ 待完成占位框
  if (inTag && tagBuf) nodes.push(<StreamTagBox key={key++} raw={tagBuf} done={false} />);
  if (buf) nodes.push(<span key={key++}>{buf}</span>);
  // 流式光标
  if (!isDone) nodes.push(<span key="cur" style={{ opacity: 0.6, animation: 'streaming-cursor-blink 0.8s step-end infinite' }}>▌</span>);

  return nodes;
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

const Bubble = memo(function Bubble({ msg, currentHue, herDataUrl, youDataUrl, youVisible, assistantFontSize, userFontSize, ttsEnabled }: any) {
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
                  borderRadius: 'var(--radius-sm)',
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
          {ttsEnabled && !msg.isStreaming ? (
            <VoiceMessageBar text={normalizeChatDisplayText(msg.segmentedContent ?? msg.text)} />
          ) : msg.isStreaming
            ? renderStreamingContent(msg.text, msg.streamingDone ?? false)
            : renderInlineStyled(normalizeChatDisplayText(msg.segmentedContent ?? msg.text))
          }
          {msg.meta && (
            <div className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-3)', marginTop: 6, letterSpacing: 0.8 }}>{msg.meta}</div>
          )}
        </div>
      </div>
    </div>
  );
});

// ── 主组件 ──────────────────────────────────────────────────────────────────

export function ChatPanel({ engine, chatRectRef, headerVisible = true, chatFontSize = 14, dreamActive = false, characterAvatarDataUrl = null, onOpenRoom, onOpenPrefs }: any) {
  const { language, t } = useI18n();
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [avatars, setAvatars] = useState(avatarStore.get());
  useEffect(() => avatarStore.subscribe(setAvatars), []);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wakeLoading, setWakeLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const voice = useVoiceInput();
  const [ttsEnabled, setTtsEnabled] = useState(false);
  useEffect(() => {
    let mounted = true;
    getDesktopTtsEnabled().then(value => { if (mounted) setTtsEnabled(value); }).catch(() => {});
    const sync = (event: Event) => setTtsEnabled(Boolean((event as CustomEvent<{ enabled: boolean }>).detail?.enabled));
    window.addEventListener('desktop-tts-settings', sync);
    return () => { mounted = false; window.removeEventListener('desktop-tts-settings', sync); };
  }, []);
  const handleMicClick = async () => {
    if (voice.isRecording) {
      const text = await voice.stop();
      if (text) setInput(prev => prev ? `${prev} ${text}` : text);
    } else {
      await voice.start();
    }
  };

  // 按日懒加载状态
  const availableDatesRef = useRef<string[]>([]);
  const loadedDatesRef = useRef<string[]>([]);
  const isLoadingMoreRef = useRef(false);
  const noMoreHistoryRef = useRef(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [noMoreHistory, setNoMoreHistory] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>({ kind: 'loading' });
  const [loadMoreError, setLoadMoreError] = useState<'network' | 'unauthorized' | 'malformed' | null>(null);
  // init() 可重入：先前端后后端起来时，靠 WS connected / 轮询重拉历史，而不是永远卡在 error。
  const historyStatusRef = useRef<HistoryStatus>({ kind: 'loading' });
  useEffect(() => { historyStatusRef.current = historyStatus; }, [historyStatus]);
  const mountedRef = useRef(false);
  const initInFlightRef = useRef(false);
  // scheduleAssistantSegments is declared later in this component; init() is declared
  // earlier so it can be reused by both the mount effect and the WS reconnect effect.
  // Route through a ref (kept in sync on every render, below) instead of a direct closure
  // reference to avoid a TDZ error in init's useCallback dependency array.
  const scheduleAssistantSegmentsRef = useRef<((fullText: string, wsMsgId?: string, preGeneratedIds?: string[]) => void) | null>(null);

  const rootRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // message_segments 关联：ws msg_id → 本地 ChatMsg id 列表
  const wsMsgIdToLocalIdsRef = useRef<Map<string, string[]>>(new Map());
  // message_segments 先于 channel_message 到达时的暂存
  const pendingSegmentsByMsgIdRef = useRef<Map<string, PendingRealitySegments>>(new Map());

  // 流式气泡：msg_id → 本地 ChatMsg id 列表（按段落分气泡，随 \n 增量增长）
  const streamingLocalIdRef = useRef<Map<string, string[]>>(new Map());
  // 流式累计原始文本：msg_id → 已到达的 token 拼接（用于按 \n+ 实时切段）
  const streamingTextRef = useRef<Map<string, string>>(new Map());

  // 注入流式动画 keyframes（仅执行一次）
  useEffect(() => {
    const id = 'emerald-streaming-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes streaming-cursor-blink { 0%,100%{opacity:.6} 50%{opacity:.15} }
      @keyframes streaming-pulse { 0%,100%{opacity:.5} 50%{opacity:.25} }
      @keyframes mic-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.75;transform:scale(0.94)} }
    `;
    document.head.appendChild(style);
  }, []);

  // Reality messages stay hidden during Dream, then re-enter the normal WS render path on wake.
  const parkedRealityMessagesRef = useRef<Map<string, ParkedRealityMessage>>(new Map());
  const processRealityChannelMessageRef = useRef<((message: RealityChannelMessage) => void) | null>(null);

  // desktopWake HTTP fallback: store reply here instead of rendering immediately.
  // WS channel_message is the primary render path; HTTP reply only renders if WS never arrives.
  const pendingWakeReplyRef = useRef<{ timerId: ReturnType<typeof setTimeout>; parts: string[]; msgId?: string } | null>(null);

  // send() / uploadDocument HTTP fallback: same pattern as desktopWake.
  // WS channel_message supersedes the HTTP reply; HTTP only renders if WS never arrives.
  const pendingSendReplyRef = useRef<{ timerId: ReturnType<typeof setTimeout>; reply: string; msgId?: string } | null>(null);

  // Tracks fallbacks that already rendered (timer fired before WS arrived).
  // Allows late-arriving channel_message to replace/skip rather than double-append.
  // Entries expire after 15s; match by msg_id first, then hash only for old HTTP responses without msg_id.
  const recentFallbacksRef = useRef<FallbackRecord[]>([]);

  // Tracks normalizedHash → timestamp for assistant bubbles loaded from history (30s window).
  // Prevents WS channel_message from double-appending content already in the chat log.
  const recentHistoryHashesRef = useRef<Map<string, number>>(new Map());

  // Tracks normalizedHash → timestamp for content already rendered by WS channel_message (30s window).
  // Prevents HTTP fallback timers from double-appending when WS arrived before pendingRef was set
  // and the old/abnormal HTTP response has no msg_id.
  const recentWSContentHashesRef = useRef<Map<string, number>>(new Map());

  // Dream 打开期间屏蔽 channel_message
  const dreamActiveRef = useRef(dreamActive);
  useEffect(() => { dreamActiveRef.current = dreamActive; }, [dreamActive]);

  const parkPendingSegments = useCallback((msgId: string, pendingSegments: PendingRealitySegments) => {
    const pending = pendingSegmentsByMsgIdRef.current;
    pruneStalePendingSegments(pending);
    setBoundedMapEntry(pending, msgId, pendingSegments, MAX_PARKED_REALITY_MESSAGES);
  }, []);

  const parkRealityMessage = useCallback((message: RealityChannelMessage) => {
    const parked = parkedRealityMessagesRef.current;
    const pendingSegments = pendingSegmentsByMsgIdRef.current.get(message.msg_id);
    if (pendingSegments) pendingSegmentsByMsgIdRef.current.delete(message.msg_id);

    const existing = parked.get(message.msg_id);
    setBoundedMapEntry(parked, message.msg_id, {
      ...message,
      pendingSegments: existing?.pendingSegments ?? pendingSegments,
    }, MAX_PARKED_REALITY_MESSAGES);
  }, []);

  // ── 启动加载 ─────────────────────────────────────────────────────────────

  // 可重入：首次挂载调用一次；historyStatus 落入 error 后，WS connected / 轮询兜底会再次调用。
  const init = useCallback(async () => {
    if (initInFlightRef.current) return;
    initInFlightRef.current = true;
    const mounted = () => mountedRef.current;
    try {
      const datesResp = await loadChatLogDates();
      if (!mounted()) return;
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
        if (!mounted()) return;
        msgs = entriesToMsgs(today, day.entries, day.raw_fallback);
        loadedDatesRef.current = [today];
        firstDate = today;

        // 不够 10 条，兜底拉前一天
        if (msgs.filter(m => m.role === 'user' || m.role === 'assistant').length < 10) {
          const todayIdx = dates.indexOf(today);
          const prevDate = dates[todayIdx + 1];
          if (prevDate) {
            const prevDay = await loadChatLogDay(prevDate);
            if (!mounted()) return;
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
        if (!mounted()) return;
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

      const historyAssistantCount = msgs.filter(m => m.role === 'assistant').length;
      console.log('[chat] appendSource: history-replay | phase: init | assistantBubbles:', historyAssistantCount, '| totalMsgs:', msgs.length);
      setMessages(msgs);

      // Register canonical turn IDs and hashes for WS cross-path dedup.
      const _histInitNow = Date.now();
      const historyIdsByTurn = new Map<string, string[]>();
      for (const _m of msgs) {
        if (_m.role === 'assistant') {
          if (_m.turnId) {
            const ids = historyIdsByTurn.get(_m.turnId) ?? [];
            ids.push(_m.id);
            historyIdsByTurn.set(_m.turnId, ids);
          }
          const _h = normalizeForDedup(_m.text);
          if (_h) {
            recentHistoryHashesRef.current.set(_h, _histInitNow);
            console.log('[chat] appendSource: history-replay-register | phase: init | hash:', _h, '| textPreview:', _m.text.slice(0, 40));
          }
        }
      }
      historyIdsByTurn.forEach((ids, turnId) => {
        setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, turnId, ids, MAX_WS_MSG_ID_MAPPINGS);
      });

      setHistoryStatus({ kind: 'ok' });

      // Phase 2B: 拉取重开问候，每次 window/page session 仅触发一次
      if (!_desktopWakeFired) {
        _desktopWakeFired = true;

        // 10min 去抖：跨刷新/重开窗口存活，排除「重登 / F5」误触发的重开问候。
        // 历史加载不受影响（上面已经拉完），只跳过 wake 这一步。
        if (shouldSkipDesktopWake()) {
          console.log('[wake] skip | reason: within WAKE_MIN_GAP_MS of last fired wake');
        } else {
          const lastAssistantMsg = msgs.filter(m => m.role === 'assistant').slice(-1)[0];
          const historyCursorSec = lastAssistantMsg
            ? lastAssistantMsg.time / 1000
            : undefined;
          console.log('[wake] start | historyCursorSec:', historyCursorSec ?? 'none');
          if (mounted()) setWakeLoading(true);
          try {
            const wakeResp = await desktopWake(historyCursorSec);
            markDesktopWakeFired();
            if (mounted() && wakeResp.reply) {
              const parts = wakeResp.reply.split(/\n+/).map(s => s.trim()).filter(Boolean);
              const msgId = responseMsgId(wakeResp);
              console.log('[wake] httpDone | loadingSource: wake | waitingForWs: true | wsState:', wsClient.getState(), '| source:', wakeResp.source, '| msg_id:', msgId ?? '(none)', '| segments:', parts.length);
              // Do NOT render directly — WS channel_message is the primary render path.
              // Store as fallback and render only if WS never delivers within 5s.
              const timerId = setTimeout(() => {
                // Identity check: bail if WS already cancelled this specific timer
                // (ref set to null) or a new wake replaced it (different timerId).
                if (pendingWakeReplyRef.current?.timerId !== timerId) {
                  console.log('[chat] appendSource: fallback-skipped | loadingSource: wake');
                  return;
                }
                // WS-before-wake-set guard: if WS channel_message arrived and rendered BEFORE
                // desktopWake HTTP returned (so pendingWakeReplyRef was not yet set at WS arrival
                // time and the WS handler could not cancel this timer), skip the fallback to
                // prevent double-render.
                const _wakeHash = normalizeForDedup(wakeResp.reply);
                const _wsRenderedAt = recentWSContentHashesRef.current.get(_wakeHash);
                const _wsAlreadyRendered = msgId
                  ? hasRegisteredMessage(wsMsgIdToLocalIdsRef.current, msgId)
                  : _wsRenderedAt !== undefined && Date.now() - _wsRenderedAt < 30_000;
                if (_wsAlreadyRendered) {
                  pendingWakeReplyRef.current = null;
                  setWakeLoading(false);
                  console.log('[chat] appendSource: fallback-skipped | loadingSource: wake | reason: ws-already-rendered | msg_id:', msgId ?? '(none)', '| hash:', _wakeHash);
                  return;
                }
                pendingWakeReplyRef.current = null;
                const fallbackIds = parts.map(() => newId());
                const normalizedHash = normalizeForDedup(wakeResp.reply);
                const contentHash = wakeResp.reply.slice(0, 32).replace(/\s+/g, ' ');
                const now = Date.now();
                recentFallbacksRef.current = [
                  ...pruneRenderedFallbacks(recentFallbacksRef.current, now),
                  { sourceKind: 'wake' as const, msgId, normalizedHash, renderedAt: now, renderedMsgIds: fallbackIds },
                ];
                if (msgId) setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, msgId, fallbackIds, MAX_WS_MSG_ID_MAPPINGS);
                console.log('[chat] appendSource: fallback | loadingSource: wake | msg_id:', msgId ?? '(none)', '| contentHash:', contentHash, '| normalizedHash:', normalizedHash, '| partsCount:', parts.length, '| renderedMsgIds:', fallbackIds, '| wsState:', wsClient.getState());
                setWakeLoading(false);
                scheduleAssistantSegmentsRef.current?.(wakeResp.reply, undefined, fallbackIds);
              }, 5000);
              pendingWakeReplyRef.current = { timerId, parts, msgId };
            } else if (mounted()) {
              console.log('[wake] HTTP response received, no reply, source:', wakeResp.source);
              setWakeLoading(false);
            }
          } catch (wakeErr) {
            console.warn('[chat] desktop_wake 失败:', wakeErr);
            if (mounted()) setWakeLoading(false);
          }
        }
      }
    } catch (err) {
      console.warn('[chat-log] 初始化失败:', err);
      if (mounted()) setHistoryStatus({ kind: 'error', ...classifyHistoryError(err) });
    } finally {
      initInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    init();
    return () => {
      mountedRef.current = false;
      if (pendingWakeReplyRef.current) {
        clearTimeout(pendingWakeReplyRef.current.timerId);
        pendingWakeReplyRef.current = null;
      }
      if (pendingSendReplyRef.current) {
        clearTimeout(pendingSendReplyRef.current.timerId);
        pendingSendReplyRef.current = null;
      }
    };
  }, [init]);

  // 兜底轮询：historyStatus 落在 error 时，每 5s 重试一次 init()，直到成功或组件卸载。
  // 覆盖「先开前端后开后端」场景下 WS state 事件因某种原因未触发的情况。
  useEffect(() => {
    if (historyStatus.kind !== 'error') return;
    const id = setInterval(() => { void init(); }, 5000);
    return () => clearInterval(id);
  }, [historyStatus.kind, init]);

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

      const loadMoreAssistantCount = newMsgs.filter(m => m.role === 'assistant').length;
      console.log('[chat] appendSource: history-replay | phase: loadMore | date:', targetDate, '| assistantBubbles:', loadMoreAssistantCount);
      setMessages(prev => {
        // 移除顶部可能存在的 no_more 占位
        const withoutNoMore = prev[0]?.role === 'no_more' ? prev.slice(1) : prev;
        return [...insertMsgs, ...withoutNoMore];
      });

      // Register loadMore canonical turn IDs and hashes for WS cross-path dedup.
      const _histLmNow = Date.now();
      const historyIdsByTurn = new Map<string, string[]>();
      for (const _m of newMsgs) {
        if (_m.role === 'assistant') {
          if (_m.turnId) {
            const ids = historyIdsByTurn.get(_m.turnId) ?? [];
            ids.push(_m.id);
            historyIdsByTurn.set(_m.turnId, ids);
          }
          const _h = normalizeForDedup(_m.text);
          if (_h) {
            recentHistoryHashesRef.current.set(_h, _histLmNow);
            console.log('[chat] appendSource: history-replay-register | phase: loadMore | hash:', _h, '| textPreview:', _m.text.slice(0, 40));
          }
        }
      }
      historyIdsByTurn.forEach((ids, turnId) => {
        setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, turnId, ids, MAX_WS_MSG_ID_MAPPINGS);
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

  // 消息不足以填满视口时自动补加载（防止内容太少无法触发滚动事件）
  useEffect(() => {
    if (noMoreHistoryRef.current || isLoadingMoreRef.current) return;
    const id = requestAnimationFrame(() => {
      const scroll = scrollRef.current;
      if (scroll && !noMoreHistoryRef.current && !isLoadingMoreRef.current &&
          scroll.scrollHeight <= scroll.clientHeight) {
        void loadMore();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [messages.length, loadMore]);

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

  const scheduleAssistantSegments = useCallback((fullText: string, wsMsgId?: string, preGeneratedIds?: string[]) => {
    const textParts = splitReply(fullText);
    if (textParts.length === 0) return;
    const contentHashRaw = fullText.slice(0, 32).replace(/\s+/g, ' ');
    const contentHashNormalized = normalizeForDedup(fullText);
    const appendSource = wsMsgId ? 'ws' : 'fallback';

    // Guard: if this wsMsgId was already processed (e.g. double channel_message), drop it.
    if (wsMsgId && hasRegisteredMessage(wsMsgIdToLocalIdsRef.current, wsMsgId)) {
      pendingSegmentsByMsgIdRef.current.delete(wsMsgId);
      console.warn('[chat] BUG-duplicate-scheduleAssistantSegments | msg_id:', wsMsgId, '| already processed — skipping to prevent double-render');
      return;
    }

    console.log('[chat] scheduleAssistantSegments | appendSource:', appendSource, '| msg_id:', wsMsgId ?? '(none)', '| partsCount:', textParts.length, '| contentHash:', contentHashRaw, '| normalizedHash:', contentHashNormalized, '| pendingWake:', !!pendingWakeReplyRef.current, '| pendingSend:', !!pendingSendReplyRef.current, '| timestamp:', Date.now());
    publishPetSnapshot({ thinking: false });

    const m = engine.get();
    const moodHue = MOOD_HUE[m.mood];
    const moodLabel = MOOD_LABEL_EN[m.mood];

    // Check for pending stripped content from message_segments that arrived first
    pruneStalePendingSegments(pendingSegmentsByMsgIdRef.current);
    const pending = wsMsgId ? pendingSegmentsByMsgIdRef.current.get(wsMsgId) : undefined;
    const strippedParts = pending ? splitReply(pending.content) : null;

    // Pre-generate ids so we can register them in the ref before setMessages resolves.
    // Caller may supply pre-generated IDs so they can record them in recentFallbacksRef
    // before the first setMessages call fires.
    const localIds = preGeneratedIds ?? textParts.map(() => newId());

    if (wsMsgId) {
      setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, wsMsgId, localIds, MAX_WS_MSG_ID_MAPPINGS);
      // Register WS content hash so fallback timers can detect this was already rendered.
      recentWSContentHashesRef.current.set(contentHashNormalized, Date.now());
      if (pending) pendingSegmentsByMsgIdRef.current.delete(wsMsgId);
    }

    const pushSeg = (idx: number) => {
      const text = textParts[idx];
      // Per-index mapping is only valid when both sides split into the same number
      // of paragraphs. On mismatch, fall back to the raw bubble text — the old
      // `?? strippedParts[0]` fallback rendered the FULL message into one bubble,
      // which displayed as duplicated text ("double-send").
      const segmentedContent = strippedParts && strippedParts.length === textParts.length
        ? strippedParts[idx]
        : undefined;
      console.log('[chat] pushSeg-append | appendSource:', appendSource, '| msg_id:', wsMsgId ?? '(none)', '| idx:', idx, '| id:', localIds[idx], '| partsTotal:', textParts.length, '| timestamp:', Date.now());
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
  scheduleAssistantSegmentsRef.current = scheduleAssistantSegments;

  // Replace an in-flight streaming bubble with the canonical content, split into
  // one bubble per paragraph (\n+). This converges the streaming path onto the
  // same final layout as scheduleAssistantSegments / the non-streaming trigger
  // path — fixing the "multi-paragraph reply collapses into one bubble" bug.
  // The first part reuses the existing streaming bubble; the rest are inserted
  // immediately after it, preserving order. All resulting localIds are registered
  // under msgId so a (possibly already-parked) message_segments envelope can map
  // per-index.
  const replaceStreamingBubbleWithParts = useCallback((
    msgId: string | undefined,
    content: string,
    normalizedHash: string,
  ): void => {
    const liveIds = (msgId ? streamingLocalIdRef.current.get(msgId) : undefined) ?? [];
    if (liveIds.length === 0) return;

    if (msgId) {
      streamingLocalIdRef.current.delete(msgId);
      streamingTextRef.current.delete(msgId);
    }
    recentWSContentHashesRef.current.set(normalizedHash, Date.now());

    const parts = splitReply(content);
    // Canonical empty after scrub → drop all live bubbles.
    if (parts.length === 0) {
      setMessages(prev => prev.filter(m => !liveIds.includes(m.id)));
      console.log('[chat] stream-replace-empty | msg_id:', msgId ?? '(none)', '| liveBubbles:', liveIds.length);
      return;
    }

    // Reuse the live bubble ids in order; the canonical split may have a
    // different paragraph count than what streamed (scrub can merge/strip),
    // so add new ids when longer and drop surplus when shorter — reused ids
    // keep their React identity (no remount flash).
    const localIds = parts.map((_, i) => liveIds[i] ?? newId());
    if (msgId) setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, msgId, localIds, MAX_WS_MSG_ID_MAPPINGS);

    // message_segments may have arrived first; per-index mapping is valid only
    // when both sides split into the same number of paragraphs.
    const pending = msgId ? pendingSegmentsByMsgIdRef.current.get(msgId) : undefined;
    const strippedParts = pending ? splitReply(pending.content) : null;
    const segMatch = !!(strippedParts && strippedParts.length === parts.length);
    if (pending && msgId) pendingSegmentsByMsgIdRef.current.delete(msgId);

    setMessages(prev => {
      const anchorIdx = prev.findIndex(m => m.id === liveIds[0]);
      if (anchorIdx === -1) return prev;
      const base = prev[anchorIdx];
      const liveById = new Map(prev.filter(m => liveIds.includes(m.id)).map(m => [m.id, m] as const));
      const rebuilt: ChatMsg[] = parts.map((text, i) => {
        const reuse = liveById.get(localIds[i]) ?? base;
        return {
          ...reuse,
          id: localIds[i],
          text,
          isStreaming: false,
          streamingDone: false,
          wsMsgId: msgId && i === 0 ? msgId : undefined,
          segments: segMatch ? pending!.segments : liveById.get(localIds[i])?.segments,
          segmentedContent: segMatch ? strippedParts![i] : undefined,
        };
      });
      // Remove all old live bubbles, then splice the rebuilt run back in at the
      // anchor's original position (robust to non-contiguous layouts).
      const withoutLive = prev.filter(m => !liveIds.includes(m.id));
      const insertAt = prev.slice(0, anchorIdx).filter(m => !liveIds.includes(m.id)).length;
      return [...withoutLive.slice(0, insertAt), ...rebuilt, ...withoutLive.slice(insertAt)];
    });
    console.log('[chat] stream-replace-split | msg_id:', msgId ?? '(none)', '| liveBubbles:', liveIds.length, '| finalParts:', parts.length, '| segMatch:', segMatch);
  }, []);

  useEffect(() => {
    publishPetSnapshot({ thinking: loading || wakeLoading });
  }, [loading, wakeLoading]);

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

    // 先开前端后开后端：历史加载在 WS 就绪前失败后，一旦后端真的活了（WS connected）
    // 就重拉一次历史，而不是永远停在 error 空白页。
    const unsubWsState = wsClient.on('state', (connState) => {
      if (connState === 'connected' && historyStatusRef.current.kind === 'error') {
        void init();
      }
    });

    const processRealityChannelMessage = ({ content, msg_id, source }: RealityChannelMessage) => {
      // Defense: only consume reality messages (source field added P0; old server = no source = reality).
      if (source && source !== 'reality') return;
      pruneStalePendingSegments(pendingSegmentsByMsgIdRef.current);

      let duplicateDropped = false;
      const normalizedHash = normalizeForDedup(content);

      // Cancel desktopWake HTTP fallback — WS is the primary render path.
      // Important: we do NOT return here; we fall through to scheduleAssistantSegments
      // below so the WS content is rendered exactly once. The cancel only prevents the
      // 5s fallback timer from rendering a second copy after WS already delivered.
      const pendingWakeHash = pendingWakeReplyRef.current
        ? normalizeForDedup(pendingWakeReplyRef.current.parts.join('\n'))
        : '';
      const pendingWakeMatches = pendingWakeReplyRef.current
        && matchesCorrelation(
          { msgId: pendingWakeReplyRef.current.msgId, normalizedHash: pendingWakeHash },
          msg_id,
          normalizedHash,
        );
      if (pendingWakeMatches) {
        clearTimeout(pendingWakeReplyRef.current.timerId);
        pendingWakeReplyRef.current = null;
        duplicateDropped = true;
        setWakeLoading(false);
        console.log('[chat] wsMatchedPending: wake | loadingClearedBy: ws | fallbackCanceled: true | msg_id:', msg_id, '| pendingSend:', !!pendingSendReplyRef.current);
      }

      // Cancel send()/uploadDocument HTTP fallback — WS supersedes HTTP reply.
      // Same no-return reasoning: WS content must still render via the shared path below.
      const pendingSendHash = pendingSendReplyRef.current
        ? normalizeForDedup(pendingSendReplyRef.current.reply)
        : '';
      const pendingSendMatches = pendingSendReplyRef.current
        && matchesCorrelation(
          { msgId: pendingSendReplyRef.current.msgId, normalizedHash: pendingSendHash },
          msg_id,
          normalizedHash,
        );
      if (pendingSendMatches) {
        clearTimeout(pendingSendReplyRef.current.timerId);
        pendingSendReplyRef.current = null;
        duplicateDropped = true;
        setLoading(false);
        console.log('[chat] wsMatchedPending: send | loadingClearedBy: ws | fallbackCanceled: true | msg_id:', msg_id);
      }

      // Check if a fallback was already rendered (timer fired before WS arrived).
      // In that case, wire the fallback bubble IDs to this msg_id and return early —
      // message_segments will then update those bubbles' segmentedContent in place.
      recentFallbacksRef.current = pruneRenderedFallbacks(recentFallbacksRef.current);
      const matchedFallback = findRenderedFallback(
        recentFallbacksRef.current,
        msg_id,
        normalizedHash,
      );
      if (matchedFallback) {
        recentFallbacksRef.current = recentFallbacksRef.current.filter(r => r !== matchedFallback);
        // Wire fallback bubble IDs to this msg_id so message_segments can update segmentedContent
        setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, msg_id, matchedFallback.renderedMsgIds, MAX_WS_MSG_ID_MAPPINGS);
        // Apply pending message_segments immediately if they already arrived before channel_message
        const pending = pendingSegmentsByMsgIdRef.current.get(msg_id);
        if (pending) {
          pendingSegmentsByMsgIdRef.current.delete(msg_id);
          const strippedParts = splitReply(pending.content);
          // Only map per-index when paragraph counts match; otherwise keep raw text.
          // `?? strippedParts[0]` on mismatch duplicated the full message into bubbles.
          const countsMatch = strippedParts.length === matchedFallback.renderedMsgIds.length;
          setMessages(prev => prev.map(m => {
            const idx = matchedFallback.renderedMsgIds.indexOf(m.id);
            if (idx === -1) return m;
            return { ...m, segments: pending.segments, segmentedContent: countsMatch ? strippedParts[idx] : undefined };
          }));
        }
        console.log('[chat] appendSource: late-ws-replace | msg_id:', msg_id, '| replacedFallback: true | sourceKind:', matchedFallback.sourceKind, '| normalizedHash:', normalizedHash, '| renderedMsgIds:', matchedFallback.renderedMsgIds, '| pendingSegmentsApplied:', !!pending, '| pendingWake: false | pendingSend: false | duplicateDropped: false');
        return;
      }

      const contentHashRaw = content.length > 0 ? content.slice(0, 32).replace(/\s+/g, ' ') : '(empty)';
      const partsCount = content.split(/\n+/).filter(s => s.trim().length > 0).length;

      // History dedup: canonical turn_id/msg_id is registered during chat-log replay.
      // Content hash remains a short-lived fallback for legacy entries without turn_id.
      const _wsNow = Date.now();
      recentHistoryHashesRef.current.forEach((ts, h) => { if (_wsNow - ts > 30_000) recentHistoryHashesRef.current.delete(h); });
      if (recentHistoryHashesRef.current.has(normalizedHash)) {
        pendingSegmentsByMsgIdRef.current.delete(msg_id);
        console.log('[chat] appendSource: history-ws-dedup | msg_id:', msg_id, '| normalizedHash:', normalizedHash, '| textPreview:', content.slice(0, 40));
        return;
      }

      console.log('[chat] appendSource: ws | msg_id:', msg_id, '| source:', source ?? 'reality', '| contentHash:', contentHashRaw, '| partsCount:', partsCount, '| normalizedHash:', normalizedHash, '| duplicateDropped:', duplicateDropped, '| replacedFallback: false');

      // 流式气泡替换：canonical channel_message 到达时用干净版替换临时气泡。
      // 注意：必须在 scheduleAssistantSegments 之前处理，否则 wsMsgIdToLocalIdsRef 里
      // 已存的 msg_id 会触发 duplicate-skip guard 而跳过渲染。
      if (streamingLocalIdRef.current.has(msg_id)) {
        // Reconcile the live streamed bubbles with the canonical (scrubbed)
        // split. Also maps any already-parked message_segments per-index.
        replaceStreamingBubbleWithParts(msg_id, content, normalizedHash);
        console.log('[chat] appendSource: stream-replace | msg_id:', msg_id, '| contentHash:', contentHashRaw);
        return;
      }

      scheduleAssistantSegments(content, msg_id);
    };

    processRealityChannelMessageRef.current = processRealityChannelMessage;

    const unsubMsg = wsClient.on('channel_message', (message) => {
      if (message.source && message.source !== 'reality') return;
      if (dreamActiveRef.current) {
        parkRealityMessage(message);
        console.log('[chat] appendSource: dream-parked | msg_id:', message.msg_id, '| parkedCount:', parkedRealityMessagesRef.current.size);
        return;
      }
      processRealityChannelMessage(message);
      void notifyOnMessage(message.msg_id, getActiveCharacterName(), message.content);
    });

    const unsubSegs = wsClient.on('message_segments', ({ content, segments, msg_id, source }) => {
      // Defense: only consume reality segments.
      if (source && source !== 'reality') return;
      const parkedMessage = parkedRealityMessagesRef.current.get(msg_id);
      if (dreamActiveRef.current || parkedMessage) {
        if (parkedMessage) {
          parkedRealityMessagesRef.current.delete(msg_id);
          parkedRealityMessagesRef.current.set(msg_id, {
            ...parkedMessage,
            pendingSegments: { content, segments, receivedAt: Date.now() },
          });
        } else {
          parkPendingSegments(msg_id, { content, segments, receivedAt: Date.now() });
        }
        console.log('[chat] appendSource: dream-segments-parked | msg_id:', msg_id, '| parkedWithChannel:', !!parkedMessage);
        return;
      }
      // Invariant: message_segments MUST NEVER append new assistant bubbles.
      // It only updates segmentedContent of existing bubbles via .map().
      const localIds = wsMsgIdToLocalIdsRef.current.get(msg_id);
      if (localIds && localIds.length > 0) {
        pendingSegmentsByMsgIdRef.current.delete(msg_id);
        // Bubbles already exist — update their segmentedContent in place.
        // channel_message msg_id matches: this is the expected path.
        const strippedParts = splitReply(content);
        const segContentHash = content.length > 0 ? content.slice(0, 32).replace(/\s+/g, ' ') : '(empty)';
        console.log('[chat] appendSource: segments-update | msg_id:', msg_id, '| localIdsCount:', localIds.length, '| contentHash:', segContentHash, '| partsCount:', strippedParts.length, '| timestamp:', Date.now());
        if (strippedParts.length !== localIds.length) {
          // Paragraph-count mismatch between message_segments content and the bubbles
          // created from channel_message. Per-index mapping would be wrong, and the old
          // `?? strippedParts[0]` fallback wrote the FULL segments content into bubble #0
          // (later bubbles kept their raw paragraph) — rendering duplicated text that
          // looked like a double-send. Keep raw bubble text; attach segments only.
          console.warn('[chat] segments-count-mismatch | msg_id:', msg_id, '| strippedParts:', strippedParts.length, '| localIds:', localIds.length, '| skipping segmentedContent overwrite');
          setMessages(prev => prev.map(m => (localIds.includes(m.id) ? { ...m, segments } : m)));
          return;
        }
        setMessages(prev => prev.map(m => {
          const idx = localIds.indexOf(m.id);
          if (idx === -1) return m;
          return {
            ...m,
            segments,
            segmentedContent: strippedParts[idx],
          };
        }));
      } else {
        // channel_message hasn't arrived yet — park segments; apply when channel_message arrives.
        // Parking MUST NOT create new bubbles; data is stored only.
        const strippedParts = splitReply(content);
        const segContentHash = content.length > 0 ? content.slice(0, 32).replace(/\s+/g, ' ') : '(empty)';
        console.log('[chat] appendSource: segments-parked | msg_id:', msg_id, '| contentHash:', segContentHash, '| partsCount:', strippedParts.length, '| timestamp:', Date.now());
        parkPendingSegments(msg_id, { content, segments, receivedAt: Date.now() });
      }
    });

    // ── 流式事件订阅 ─────────────────────────────────────────────────────────

    const unsubStreamStart = wsClient.on('message_stream_start', ({ msg_id }) => {
      if (dreamActiveRef.current) return;
      // 流开始即停 loading 状态（用户已能看到 token 到来，无需继续等）
      setLoading(false);
      const firstId = newId();
      streamingLocalIdRef.current.set(msg_id, [firstId]);
      streamingTextRef.current.set(msg_id, '');
      const m = engine.get();
      setMessages(prev => [...prev, {
        id: firstId,
        role: 'assistant' as const,
        text: '',
        moodHue: MOOD_HUE[m.mood],
        moodLabel: MOOD_LABEL_EN[m.mood],
        time: Date.now(),
        wsMsgId: msg_id,
        isStreaming: true,
        streamingDone: false,
      }]);
      console.log('[chat] stream-start | msg_id:', msg_id, '| localId:', firstId);
    });

    const unsubStreamDelta = wsClient.on('message_stream_delta', ({ msg_id, delta }) => {
      const ids = streamingLocalIdRef.current.get(msg_id);
      if (!ids) return;
      // Accumulate raw text and re-derive paragraph bubbles live: as soon as a
      // \n boundary completes a paragraph, a new bubble appears mid-stream
      // (instead of one bubble that splits all at once on stream-end).
      const acc = (streamingTextRef.current.get(msg_id) ?? '') + delta;
      streamingTextRef.current.set(msg_id, acc);
      const parts = splitReply(acc);
      const effParts = parts.length === 0 ? [''] : parts;
      while (ids.length < effParts.length) ids.push(newId());
      streamingLocalIdRef.current.set(msg_id, ids);
      const lastIdx = effParts.length - 1;
      const m = engine.get();
      setMessages(prev => {
        const present = new Set(prev.map(x => x.id));
        // Update text + cursor flag of already-rendered live bubbles. Only the
        // last bubble keeps the blinking cursor (streamingDone=false).
        let next = prev.map(item => {
          const i = ids.indexOf(item.id);
          if (i === -1 || i >= effParts.length) return item;
          return { ...item, text: effParts[i], isStreaming: true, streamingDone: i !== lastIdx };
        });
        // Append newly-needed bubbles after the last present live bubble.
        const missing = ids.slice(0, effParts.length).filter(id => !present.has(id));
        if (missing.length) {
          const lastPresent = [...ids.slice(0, effParts.length)].reverse().find(id => present.has(id));
          const insertAt = lastPresent ? next.findIndex(x => x.id === lastPresent) + 1 : next.length;
          const added: ChatMsg[] = missing.map(id => {
            const i = ids.indexOf(id);
            return {
              id,
              role: 'assistant' as const,
              text: effParts[i],
              moodHue: MOOD_HUE[m.mood],
              moodLabel: MOOD_LABEL_EN[m.mood],
              time: Date.now(),
              wsMsgId: i === 0 ? msg_id : undefined,
              isStreaming: true,
              streamingDone: i !== lastIdx,
            };
          });
          next = [...next.slice(0, insertAt), ...added, ...next.slice(insertAt)];
        }
        return next;
      });
    });

    const unsubStreamEnd = wsClient.on('message_stream_end', ({ msg_id }) => {
      // 流结束：关闭所有气泡的打字光标，等待 canonical channel_message 替换
      const ids = streamingLocalIdRef.current.get(msg_id);
      if (!ids) return;
      setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, streamingDone: true } : m));
      void notifyOnMessage(msg_id, getActiveCharacterName(), streamingTextRef.current.get(msg_id) ?? '');
      console.log('[chat] stream-end | msg_id:', msg_id, '| bubbles:', ids.length);
    });

    return () => {
      mounted = false;
      unsubWsState();
      unsubMsg();
      unsubSegs();
      unsubStreamStart();
      unsubStreamDelta();
      unsubStreamEnd();
      if (processRealityChannelMessageRef.current === processRealityChannelMessage) {
        processRealityChannelMessageRef.current = null;
      }
    };
  }, [engine, init, parkPendingSegments, parkRealityMessage, scheduleAssistantSegments]);

  useEffect(() => {
    if (dreamActive) return;
    const processRealityChannelMessage = processRealityChannelMessageRef.current;
    if (!processRealityChannelMessage || parkedRealityMessagesRef.current.size === 0) return;

    const parkedMessages = Array.from(parkedRealityMessagesRef.current.values());
    parkedRealityMessagesRef.current.clear();
    parkedMessages.forEach(message => {
      if (message.pendingSegments) {
        setBoundedMapEntry(
          pendingSegmentsByMsgIdRef.current,
          message.msg_id,
          { ...message.pendingSegments, receivedAt: Date.now() },
          MAX_PARKED_REALITY_MESSAGES,
        );
      }
      processRealityChannelMessage(message);
      // The normal render path consumes segments synchronously. Any remainder belongs
      // to a message that another dedup path intentionally skipped.
      pendingSegmentsByMsgIdRef.current.delete(message.msg_id);
    });
    console.log('[chat] appendSource: dream-flush | flushedCount:', parkedMessages.length);
  }, [dreamActive]);

  // ── 输入处理 ──────────────────────────────────────────────────────────────

  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInputChange = (v: string) => {
    setInput(v);
    engine.markInteraction();
    if (state.focus !== '看你打字') engine.setLocalFocus('看你打字');
    if (inputTimer.current) clearTimeout(inputTimer.current);
    inputTimer.current = setTimeout(() => engine.setLocalFocus('看你'), 2500);
  };

  const send = async () => {
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    setMessages(m => [...m, { id: newId(), role: 'user', text: t, time: Date.now() }]);
    engine.setLocalFocus('想事情');
    setLoading(true);
    try {
      const response = await sendChat(t);
      const { reply } = response;
      const msgId = responseMsgId(response);
      // Do NOT render directly — WS channel_message is the primary render path.
      // Store as fallback; render only if WS never delivers within 3s.
      const contentHash = reply.slice(0, 32).replace(/\s+/g, ' ');
      if (pendingSendReplyRef.current) {
        clearTimeout(pendingSendReplyRef.current.timerId);
      }
      const timerId = setTimeout(() => {
        // Identity check: WS may have cancelled this timer and nulled the ref,
        // or a rapid second send may have replaced the ref with a newer timer.
        if (pendingSendReplyRef.current?.timerId !== timerId) {
          console.log('[chat] appendSource: fallback-skipped | loadingSource: send');
          return;
        }
        const normalizedHash = normalizeForDedup(reply);
        const wsRenderedAt = recentWSContentHashesRef.current.get(normalizedHash);
        const wsAlreadyRendered = msgId
          ? hasRegisteredMessage(wsMsgIdToLocalIdsRef.current, msgId)
          : wsRenderedAt !== undefined && Date.now() - wsRenderedAt < 30_000;
        if (wsAlreadyRendered) {
          pendingSendReplyRef.current = null;
          setLoading(false);
          console.log('[chat] appendSource: fallback-skipped | loadingSource: send | reason: ws-already-rendered | msg_id:', msgId ?? '(none)', '| normalizedHash:', normalizedHash);
          return;
        }
        // 流式气泡存在（WS 流中途断开，canonical 未到达）→ 用完整 HTTP 文本替换临时气泡
        if (msgId && streamingLocalIdRef.current.has(msgId)) {
          replaceStreamingBubbleWithParts(msgId, reply, normalizedHash);
          pendingSendReplyRef.current = null;
          setLoading(false);
          console.log('[chat] appendSource: stream-fallback-replace | loadingSource: send | msg_id:', msgId);
          return;
        }
        pendingSendReplyRef.current = null;
        const parts = splitReply(reply);
        const fallbackIds = parts.map(() => newId());
        const now = Date.now();
        recentFallbacksRef.current = [
          ...pruneRenderedFallbacks(recentFallbacksRef.current, now),
          { sourceKind: 'send' as const, msgId, normalizedHash, renderedAt: now, renderedMsgIds: fallbackIds },
        ];
        if (msgId) setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, msgId, fallbackIds, MAX_WS_MSG_ID_MAPPINGS);
        console.log('[chat] appendSource: fallback | loadingSource: send | msg_id:', msgId ?? '(none)', '| contentHash:', contentHash, '| normalizedHash:', normalizedHash, '| partsCount:', parts.length, '| renderedMsgIds:', fallbackIds, '| timestamp:', now);
        setLoading(false);
        scheduleAssistantSegments(reply, undefined, fallbackIds);
      }, 3000);
      pendingSendReplyRef.current = { timerId, reply, msgId };
      console.log('[chat] httpDone | loadingSource: send | waitingForWs: true | msg_id:', msgId ?? '(none)', '| contentHash:', contentHash, '| partsCount:', reply.split(/\n+/).filter(Boolean).length, '| timestamp:', Date.now());
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
      setLoading(false);
      console.log('[chat] loadingClearedBy: error | loadingSource: send');
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
      // Defer render same as send() — WS channel_message is primary path.
      const reply = resp.reply;
      const msgId = responseMsgId(resp);
      const contentHash = reply.slice(0, 32).replace(/\s+/g, ' ');
      if (pendingSendReplyRef.current) {
        clearTimeout(pendingSendReplyRef.current.timerId);
      }
      const timerId = setTimeout(() => {
        if (pendingSendReplyRef.current?.timerId !== timerId) {
          console.log('[chat] appendSource: fallback-skipped | loadingSource: upload');
          return;
        }
        const normalizedHash = normalizeForDedup(reply);
        const wsRenderedAt = recentWSContentHashesRef.current.get(normalizedHash);
        const wsAlreadyRendered = msgId
          ? hasRegisteredMessage(wsMsgIdToLocalIdsRef.current, msgId)
          : wsRenderedAt !== undefined && Date.now() - wsRenderedAt < 30_000;
        if (wsAlreadyRendered) {
          pendingSendReplyRef.current = null;
          setLoading(false);
          console.log('[chat] appendSource: fallback-skipped | loadingSource: upload | reason: ws-already-rendered | msg_id:', msgId ?? '(none)', '| normalizedHash:', normalizedHash);
          return;
        }
        // 流式气泡存在（WS 流中途断开）→ 用完整 HTTP 文本替换临时气泡
        if (msgId && streamingLocalIdRef.current.has(msgId)) {
          replaceStreamingBubbleWithParts(msgId, reply, normalizedHash);
          pendingSendReplyRef.current = null;
          setLoading(false);
          console.log('[chat] appendSource: stream-fallback-replace | loadingSource: upload | msg_id:', msgId);
          return;
        }
        pendingSendReplyRef.current = null;
        const parts = splitReply(reply);
        const fallbackIds = parts.map(() => newId());
        const now = Date.now();
        recentFallbacksRef.current = [
          ...pruneRenderedFallbacks(recentFallbacksRef.current, now),
          { sourceKind: 'upload' as const, msgId, normalizedHash, renderedAt: now, renderedMsgIds: fallbackIds },
        ];
        if (msgId) setBoundedMapEntry(wsMsgIdToLocalIdsRef.current, msgId, fallbackIds, MAX_WS_MSG_ID_MAPPINGS);
        console.log('[chat] appendSource: fallback | loadingSource: upload | msg_id:', msgId ?? '(none)', '| contentHash:', contentHash, '| normalizedHash:', normalizedHash, '| partsCount:', parts.length, '| renderedMsgIds:', fallbackIds, '| timestamp:', now);
        setLoading(false);
        scheduleAssistantSegments(reply, undefined, fallbackIds);
      }, 3000);
      pendingSendReplyRef.current = { timerId, reply, msgId };
      console.log('[chat] httpDone | loadingSource: upload | waitingForWs: true | msg_id:', msgId ?? '(none)', '| contentHash:', contentHash, '| partsCount:', reply.split(/\n+/).filter(Boolean).length, '| timestamp:', Date.now());
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
      setLoading(false);
      console.log('[chat] loadingClearedBy: error | loadingSource: upload');
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
      background: avatars.chatBackground?.dataUrl ? 'transparent' : 'var(--paper)',
      overflow: 'hidden',
    }}>
      {/* HEADER */}
      {headerVisible && (
        <div style={{
          padding: '20px 28px 14px', borderBottom: '1px solid var(--paper-edge)',
          background: avatars.chatBackground?.dataUrl ? 'oklch(from var(--paper) l c h / 0.75)' : 'var(--paper)',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <BreathingAvatar engine={engine} hue={currentHue} size={50} dataUrl={herDataUrl} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ margin: 0, fontSize: chatThemeFontSize(28), fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.4 }}>
                对话
              </h1>
              <span className="mono" style={{ fontSize: chatThemeFontSize(10.5), color: 'var(--ink-3)', letterSpacing: 1.3 }}>
                CHAPTER · {new Date().toLocaleDateString(language, { month: 'long', day: 'numeric' }).toUpperCase()}
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
            <Btn icon="settings" dense onClick={onOpenPrefs}>偏好</Btn>
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
        style={{ flex: 1, overflowY: 'auto', padding: `8px ${youVisible ? 56 : 28}px 12px 28px`, background: avatars.chatBackground?.dataUrl ? 'transparent' : 'var(--paper)' }}
      >
        {/* 初始加载中占位 */}
        {historyStatus.kind === 'loading' && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0 20px' }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>正在加载历史记录…</span>
          </div>
        )}

        {/* 初始加载失败占位：先开前端后开后端时不留纯空白，后端起来后（WS connected / 5s 轮询）自动重拉 */}
        {historyStatus.kind === 'error' && messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>
              {t(historyStatus.category === 'network'
                ? 'chat.history.waiting.network'
                : historyStatus.category === 'unauthorized'
                  ? 'chat.history.waiting.unauthorized'
                  : 'chat.history.waiting.invalid')}
            </span>
            <button
              onClick={() => void init()}
              style={{
                fontSize: chatThemeFontSize(10), padding: '4px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--paper-edge)',
                color: 'var(--ink-3)', fontFamily: 'inherit',
              }}>
              重试
            </button>
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
          <div key={m.id} className={m.role === 'user' || m.role === 'assistant' ? 'msg-enter' : undefined}>
            <Bubble
              msg={m}
              currentHue={currentHue}
              herDataUrl={herDataUrl}
              youDataUrl={youDataUrl}
              youVisible={youVisible}
              assistantFontSize={fontSizes.assistant}
              userFontSize={fontSizes.user}
              ttsEnabled={ttsEnabled}
            />
          </div>
        ))}

        {(typing || loading || wakeLoading) && (
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
      <div style={{ position: 'relative', padding: 18, borderTop: '1px solid var(--paper-edge)', background: avatars.chatBackground?.dataUrl ? 'oklch(from var(--paper-2) l c h / 0.85)' : 'var(--paper-2)' }}>
        {showAttachMenu && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 18, marginBottom: 8,
            background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-md)',
            padding: 6, minWidth: 200,
            boxShadow: '0 12px 32px oklch(0.30 0.04 60 / 0.20)', zIndex: 10,
          }}>
            {([
              ['attach', '附加文件',   '.txt .md .docx',       'doc'],
              ['attach', '插入图片',    '.png .jpg .gif .webp', 'img'],
              ['video',  '视频通话',   '进入她的空间',           'room'],
            ] as [string, string, string, string][]).map(([icon, label, sub, action]) => (
              <button key={label} onClick={
                action === 'doc'  ? onClickAttach :
                action === 'img'  ? onClickImage :
                action === 'room' ? () => { setShowAttachMenu(false); onOpenRoom?.(); } :
                () => setShowAttachMenu(false)
              } style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--ink)', textAlign: 'left', borderRadius: 'var(--radius-sm)', fontFamily: 'inherit',
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
          <button onClick={() => void handleMicClick()} title={voice.isRecording ? '点击停止录音' : '语音输入 (Alt+1)'} style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: voice.isRecording ? 'oklch(0.55 0.18 25)' : 'var(--paper)',
            color: voice.isRecording ? '#fff' : 'var(--ink)',
            border: '1px solid var(--paper-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
            animation: voice.isRecording ? 'mic-pulse 1.2s ease-in-out infinite' : 'none',
          }}>
            <Icon name="mic" size={18} />
          </button>
          <button onClick={() => setShowAttachMenu(s => !s)} style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
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
              padding: '11px 14px', borderRadius: 'var(--radius-md)',
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              color: 'var(--ink)', fontSize: chatFontSize, fontFamily: 'var(--font-serif)',
              outline: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5,
            }}
          />
          <button onClick={send} style={{
            height: 40, padding: '0 18px', borderRadius: 'var(--radius-md)',
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
