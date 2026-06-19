/* ============================================================
 * ToyChatPanel — 玩耍模式聊天页
 *   自包含 append-only 聊天，经 sendChat() 走 /desktop/chat（与主聊天同一会话）。
 *   不读历史 / 不订阅 WS；回复同样会经 WS 同步回主聊天面板。
 * ============================================================ */

import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { sendChat } from '../../../shared/api/backend';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

const bubbleBase: CSSProperties = {
  maxWidth: '78%',
  padding: '9px 13px',
  borderRadius: 12,
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export function ToyChatPanel({ chatFontSize = 14 }: { chatFontSize?: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setInput('');
    const userMsg: Msg = { id: nextId.current++, role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    scrollToBottom();
    setSending(true);
    try {
      const res = await sendChat(text);
      setMessages(prev => [...prev, { id: nextId.current++, role: 'assistant', text: res.reply }]);
      scrollToBottom();
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)',
    }}>
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.length === 0 && (
          <div className="serif" style={{
            margin: 'auto', color: 'var(--ink-3)', fontSize: 13.5, textAlign: 'center', lineHeight: 1.8,
          }}>
            玩耍模式已开启。<br />在这里和叶瑄说话，左侧能看到设备状态。
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              ...bubbleBase,
              fontSize: chatFontSize,
              background: m.role === 'user' ? 'var(--forest)' : 'var(--paper-2)',
              color: m.role === 'user' ? 'var(--on-forest)' : 'var(--ink)',
              border: m.role === 'user' ? 'none' : '1px solid var(--paper-edge)',
            }}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--ink-3)', fontSize: 12 }}>叶瑄正在回复…</div>
        )}
      </div>

      {error && (
        <div style={{
          padding: '6px 22px', fontSize: 11.5,
          color: 'var(--status-error, oklch(0.65 0.2 25))',
        }}>
          发送失败：{error}
        </div>
      )}

      <div style={{
        padding: '12px 18px', borderTop: '1px solid var(--paper-edge)',
        display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--paper-2)',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="和叶瑄说点什么…"
          style={{
            flex: 1, resize: 'none', maxHeight: 120,
            padding: '9px 12px', fontSize: chatFontSize, fontFamily: 'inherit',
            border: '1px solid var(--paper-edge)', borderRadius: 10,
            background: 'var(--paper)', color: 'var(--ink)', outline: 'none',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          style={{
            padding: '9px 18px', fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
            border: 'none', borderRadius: 10,
            background: 'var(--forest)', color: 'var(--on-forest)',
            cursor: sending || !input.trim() ? 'default' : 'pointer',
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}>
          发送
        </button>
      </div>
    </div>
  );
}
