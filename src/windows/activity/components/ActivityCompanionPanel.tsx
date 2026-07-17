import { useState, useEffect, useRef } from 'react';
import {
  gomokuApi, chessApi, readingApi,
  type GomokuGroundingFacts, type GomokuUserMoveFacts,
  type ChessGroundingFacts,
  type ReadingGroundingFacts,
} from '../../../shared/api/activity-api';
import { getActiveCharacterName } from '../../../shared/activeCharacter';
import { armHttpPseudoStream } from '../../../shared/api/pseudoStreamText';

let _msgId = 0;
function newMsgId() { return `ac-${Date.now()}-${++_msgId}`; }

type ActivityId = 'gomoku' | 'chess' | 'reading';

type AnyGrounding = GomokuGroundingFacts | ChessGroundingFacts | ReadingGroundingFacts;

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
  grounding?: AnyGrounding;
}

// ── Grounding hint renderers ────────────────────────────────────────────────

function buildUserMoveHint(f: GomokuUserMoveFacts): string | null {
  if (f.summary) return `依据：${f.summary}`;
  if ((f.created_chain ?? 0) >= 3) return `依据：你这手形成了 ${f.created_chain} 连。`;
  if ((f.blocked_opponent_chain ?? 0) >= 3) return `依据：你这手挡住了对方的 ${f.blocked_opponent_chain} 连。`;
  if ((f.adjacent_stones ?? 0) > 0) return `依据：你这手靠近已有棋子，附近有 ${f.adjacent_stones} 枚相邻棋子。`;
  if (f.is_center_area) return `依据：你这手靠近棋盘中心。`;
  return null;
}

function GomokuGroundingHint({ grounding }: { grounding?: GomokuGroundingFacts }) {
  const userHint = grounding?.last_user_move_facts
    ? buildUserMoveHint(grounding.last_user_move_facts)
    : null;
  const aiHint = grounding?.last_ai_move_facts?.summary
    ? `${getActiveCharacterName()}上一手：${grounding.last_ai_move_facts.summary}`
    : null;
  const hasContent = userHint || aiHint;
  return (
    <GroundingHintBox hasContent={!!hasContent}>
      {hasContent ? (
        <>
          {userHint && <div>{userHint}</div>}
          {aiHint && <div>{aiHint}</div>}
        </>
      ) : (
        <div>这句是陪聊，不是棋局判断。</div>
      )}
    </GroundingHintBox>
  );
}

function ChessGroundingHint({ grounding }: { grounding?: ChessGroundingFacts }) {
  const parts: string[] = [];
  if (grounding?.is_check) parts.push('将军');
  if (grounding?.move_hint && grounding.move_hint !== '普通走法') parts.push(grounding.move_hint);
  if (grounding?.captured_piece) parts.push(`吃了${grounding.captured_piece}`);
  if (grounding?.last_san) parts.push(`上一手：${grounding.last_san}`);
  if (grounding?.material_balance_desc) parts.push(grounding.material_balance_desc);
  const hint = parts.length > 0 ? `依据：${parts.join('，')}。` : null;
  return (
    <GroundingHintBox hasContent={!!hint}>
      {hint ? <div>{hint}</div> : <div>这句是陪聊，不是棋局判断。</div>}
    </GroundingHintBox>
  );
}

function ReadingGroundingHint({ grounding }: { grounding?: ReadingGroundingFacts }) {
  const hint = grounding?.current_page != null && grounding?.total_pages != null
    ? `读到第 ${grounding.current_page} / ${grounding.total_pages} 页（约 ${grounding.progress_pct ?? 0}%）`
    : null;
  return (
    <GroundingHintBox hasContent={!!hint}>
      {hint ? <div>依据：{hint}</div> : <div>这句是陪聊，不关联页面内容。</div>}
    </GroundingHintBox>
  );
}

function GroundingHintBox({ hasContent, children }: { hasContent: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 5,
      fontSize: 11.5,
      lineHeight: 1.55,
      color: 'var(--ink-3)',
      opacity: hasContent ? 0.72 : 0.45,
      maxWidth: '100%',
      wordBreak: 'break-word',
    }}>
      {children}
    </div>
  );
}

function GroundingHint({ activityId, grounding }: { activityId: ActivityId; grounding?: AnyGrounding }) {
  if (activityId === 'gomoku') return <GomokuGroundingHint grounding={grounding as GomokuGroundingFacts} />;
  if (activityId === 'chess') return <ChessGroundingHint grounding={grounding as ChessGroundingFacts} />;
  return <ReadingGroundingHint grounding={grounding as ReadingGroundingFacts} />;
}

// ── API dispatch ────────────────────────────────────────────────────────────

async function callChat(
  activityId: ActivityId,
  sessionId: string,
  message: string,
): Promise<{ reply: string; control?: Record<string, unknown>; grounding?: AnyGrounding }> {
  if (activityId === 'chess') return chessApi.chat({ session_id: sessionId, message });
  if (activityId === 'reading') return readingApi.chat({ session_id: sessionId, message });
  return gomokuApi.chat({ session_id: sessionId, message });
}

// ── Status text ─────────────────────────────────────────────────────────────

const STATUS_IDLE: Record<ActivityId, string> = {
  gomoku: '请先开始棋局',
  chess: '请先开始棋局',
  reading: '请先开始阅读',
};

const STATUS_FINISHED: Record<ActivityId, string> = {
  gomoku: '这局已经结束',
  chess: '这局已经结束',
  reading: '阅读已关闭',
};

// ── Panel ───────────────────────────────────────────────────────────────────

interface Props {
  activityId: ActivityId;
  sessionId: string | null;
  sessionActive: boolean;
  sessionFinished: boolean;
  onCollapse?: () => void;
}

export function ActivityCompanionPanel({ activityId, sessionId, sessionActive, sessionFinished, onCollapse }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingActive, setStreamingActive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevSessionId = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId !== prevSessionId.current) {
      prevSessionId.current = sessionId;
      setMessages([]);
      setInput('');
    }
  }, [sessionId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // §I: proactive AI comments pushed from the game page (after AI moves / game end)
  useEffect(() => {
    function onPush(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { activityId: ActivityId; sessionId: string | null; text: string; grounding?: AnyGrounding }
        | undefined;
      if (!detail || detail.activityId !== activityId || detail.sessionId !== sessionId) return;
      setMessages(prev => [...prev, { role: 'assistant', text: detail.text, grounding: detail.grounding }]);
    }
    window.addEventListener('activity-companion-push', onPush);
    return () => window.removeEventListener('activity-companion-push', onPush);
  }, [activityId, sessionId]);

  const canSend = !!sessionId && sessionActive && !sending;

  const handleSend = async () => {
    if (!canSend || !input.trim() || !sessionId) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setSending(true);

    // Brief 84 (Emerald-presence): *_chat replies now play a server-side pseudo-stream
    // typewriter replay over WS before the HTTP response resolves. Surface it live
    // instead of the static "…" placeholder; fail-open if no frames arrive (WS down /
    // config off) — the HTTP reply lands whole exactly like before.
    let streamId: string | null = null;
    let streamText = '';
    const disarmStream = armHttpPseudoStream(delta => {
      streamText += delta;
      if (streamId === null) {
        streamId = newMsgId();
        setStreamingActive(true);
        const id = streamId;
        setMessages(prev => [...prev, { id, role: 'assistant', text: streamText }]);
      } else {
        const id = streamId;
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: streamText } : m)));
      }
    });

    try {
      const result = await callChat(activityId, sessionId, text);
      disarmStream();
      console.debug(`[${activityId}-chat] control`, result.control);
      console.debug(`[${activityId}-chat] grounding`, result.grounding);
      if (streamId) {
        const id: string = streamId;
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: result.reply, grounding: result.grounding } : m)));
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: result.reply, grounding: result.grounding }]);
      }
    } catch (e: any) {
      disarmStream();
      if (streamId) {
        const id: string = streamId;
        setMessages(prev => prev.filter(m => m.id !== id));
      }
      setMessages(prev => [...prev, { role: 'assistant', text: String(e?.message ?? e), error: true }]);
    } finally {
      setSending(false);
      setStreamingActive(false);
    }
  };

  const statusText = !sessionId
    ? STATUS_IDLE[activityId]
    : sessionFinished
    ? STATUS_FINISHED[activityId]
    : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      writingMode: 'horizontal-tb',
      width: '100%', minWidth: 0, minHeight: 0, maxHeight: '100%',
      background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
      borderRadius: 'var(--radius-md)', overflow: 'hidden',
    }}>
      {/* header */}
      <div className="mono" style={{
        padding: '9px 14px', borderBottom: '1px solid var(--paper-edge)',
        fontSize: 10, letterSpacing: 1.2, fontWeight: 600, color: 'var(--ink-3)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{ flex: 1 }}>和{getActiveCharacterName()}说说</span>
        <button
          onClick={() => onCollapse?.()}
          title="收起"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--ink-3)', fontSize: 14, lineHeight: 1,
            padding: '0 2px', display: 'flex', alignItems: 'center',
          }}
        >»</button>
      </div>

      {/* messages */}
      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.7,
            writingMode: 'horizontal-tb', whiteSpace: 'normal',
          }}>
            活动里的话只留在这里。
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id ?? i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '88%',
          }}>
            <div style={{
              padding: '6px 10px',
              borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: msg.role === 'user'
                ? 'var(--ink)'
                : msg.error ? 'oklch(0.95 0.05 20)' : 'var(--paper)',
              color: msg.role === 'user'
                ? 'var(--paper)'
                : msg.error ? 'oklch(0.40 0.14 20)' : 'var(--ink)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--paper-edge)',
              fontSize: 12.5, lineHeight: 1.6,
              wordBreak: 'break-word',
            }}>
              {msg.text}
            </div>
            {msg.role === 'assistant' && !msg.error && (
              <GroundingHint activityId={activityId} grounding={msg.grounding} />
            )}
          </div>
        ))}
        {sending && !streamingActive && (
          <div style={{ alignSelf: 'flex-start' }}>
            <div style={{
              padding: '6px 10px', borderRadius: '10px 10px 10px 2px',
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              fontSize: 12.5, color: 'var(--ink-3)',
            }}>
              …
            </div>
          </div>
        )}
      </div>

      {/* status or input */}
      {statusText ? (
        <div className="mono" style={{
          padding: '8px 14px', borderTop: '1px solid var(--paper-edge)',
          fontSize: 11, color: 'var(--ink-3)', letterSpacing: 0.3, flexShrink: 0,
        }}>
          {statusText}
        </div>
      ) : (
        <div style={{
          padding: '8px 10px', borderTop: '1px solid var(--paper-edge)',
          display: 'flex', gap: 6, flexShrink: 0,
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={`和${getActiveCharacterName()}说一句……`}
            disabled={!canSend}
            style={{
              flex: 1, fontFamily: 'inherit', fontSize: 12,
              padding: '5px 8px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--paper-edge)', background: 'var(--paper)',
              color: 'var(--ink)', outline: 'none',
              opacity: !canSend ? 0.5 : 1,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend || !input.trim()}
            style={{
              fontFamily: 'inherit', fontSize: 12, padding: '5px 10px',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--ink)',
              background: 'var(--ink)', color: 'var(--paper)',
              cursor: !canSend || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: !canSend || !input.trim() ? 0.45 : 1,
              fontWeight: 600, flexShrink: 0,
            }}
          >
            发送
          </button>
        </div>
      )}
    </div>
  );
}
