import { useState, useEffect, useRef } from 'react';
import { gomokuApi, type GomokuGroundingFacts, type GomokuUserMoveFacts } from '../../../shared/api/activity-api';

interface ChatMessage {
  role: 'user' | 'yexuan';
  text: string;
  error?: boolean;
  grounding?: GomokuGroundingFacts;
}

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
    ? `叶瑄上一手：${grounding.last_ai_move_facts.summary}`
    : null;

  const hasContent = userHint || aiHint;

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
      {hasContent ? (
        <>
          {userHint && <div>{userHint}</div>}
          {aiHint && <div>{aiHint}</div>}
        </>
      ) : (
        <div>这句是陪聊，不是棋局判断。</div>
      )}
    </div>
  );
}

interface Props {
  sessionId: string | null;
  sessionActive: boolean;
  sessionFinished: boolean;
}

export function ActivityCompanionPanel({ sessionId, sessionActive, sessionFinished }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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

  const canSend = !!sessionId && sessionActive && !sending;

  const handleSend = async () => {
    if (!canSend || !input.trim() || !sessionId) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setSending(true);
    try {
      const result = await gomokuApi.chat({ session_id: sessionId, message: text });
      console.debug('[gomoku-chat] control', result.control);
      console.debug('[gomoku-chat] grounding', result.grounding);
      setMessages(prev => [...prev, { role: 'yexuan', text: result.reply, grounding: result.grounding }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'yexuan', text: String(e?.message ?? e), error: true }]);
    } finally {
      setSending(false);
    }
  };

  const statusText = !sessionId
    ? '请先开始棋局'
    : sessionFinished
    ? '这局已经结束'
    : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      writingMode: 'horizontal-tb',
      width: '100%', minWidth: 280, minHeight: 360,
      background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* header */}
      <div className="mono" style={{
        padding: '9px 14px', borderBottom: '1px solid var(--paper-edge)',
        fontSize: 10, letterSpacing: 1.2, fontWeight: 600, color: 'var(--ink-3)',
        flexShrink: 0,
      }}>
        和叶瑄说说
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
            棋局里的话只留在这局里。
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
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
            {msg.role === 'yexuan' && !msg.error && (
              <GomokuGroundingHint grounding={msg.grounding} />
            )}
          </div>
        ))}
        {sending && (
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
            placeholder="和叶瑄说一句……"
            disabled={!canSend}
            style={{
              flex: 1, fontFamily: 'inherit', fontSize: 12,
              padding: '5px 8px', borderRadius: 4,
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
              borderRadius: 4, border: '1px solid var(--ink)',
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
