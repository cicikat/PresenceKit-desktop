import { useEffect, useRef, useState } from 'react';
import { dreamSeedApi } from '../../../shared/api/activity-api';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const buttonStyle = {
  border: '1px solid var(--ink)',
  background: 'var(--ink)',
  color: 'var(--paper)',
  borderRadius: 'var(--radius-sm)',
  padding: '7px 14px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

export function DreamSeedPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dreamSeedApi.state()
      .then(state => {
        setSessionId(state.active ? state.session_id : null);
        if (state.has_seed) setSeed(state.seed_preview);
      })
      .catch(err => setError(String(err?.message ?? err)));
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await dreamSeedApi.start();
      setSessionId(result.session_id);
      setMessages([]);
      setSeed('');
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!sessionId || !text || busy) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setBusy(true);
    setError('');
    try {
      const result = await dreamSeedApi.chat(sessionId, text);
      if (result.reply) setMessages(prev => [...prev, { role: 'assistant', text: result.reply }]);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await dreamSeedApi.close(sessionId);
      if (!result.success) {
        setError('再多说一点，才能留下今晚的梦境种子。');
        return;
      }
      setSeed(result.seed_text);
      setSessionId(null);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      flex: 1, minWidth: 0, padding: 32, display: 'flex', gap: 24,
      background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden',
    }}>
      <section style={{ width: 270, flexShrink: 0 }}>
        <div className="serif" style={{ fontSize: 25, fontWeight: 600, marginBottom: 8 }}>梦境预构</div>
        <div style={{ color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.75, marginBottom: 20 }}>
          睡前一起决定今晚梦的地点、氛围，以及我们会做什么。结束后，它会成为下一场梦的入口。
        </div>
        {!sessionId ? (
          <button style={buttonStyle} disabled={busy} onClick={start}>开始预构</button>
        ) : (
          <button style={buttonStyle} disabled={busy} onClick={close}>写好今晚的梦</button>
        )}
        {seed && (
          <div style={{
            marginTop: 22, padding: 14, borderRadius: 'var(--radius-md)',
            background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
            fontSize: 12.5, lineHeight: 1.7,
          }}>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 7 }}>
              TONIGHT'S SEED
            </div>
            {seed}
          </div>
        )}
        {error && <div style={{ marginTop: 14, fontSize: 12, color: 'oklch(0.48 0.16 25)' }}>{error}</div>}
      </section>

      <section style={{
        flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column',
        border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        background: 'var(--paper-2)',
      }}>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', color: 'var(--ink-3)', fontSize: 12, textAlign: 'center', lineHeight: 1.7 }}>
              {sessionId ? '先从一个地点，或一种想要的天气开始。' : '开始预构后，对话会只留在这次活动里。'}
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '76%', padding: '7px 11px', fontSize: 13, lineHeight: 1.65,
              borderRadius: message.role === 'user' ? '11px 11px 3px 11px' : '11px 11px 11px 3px',
              background: message.role === 'user' ? 'var(--ink)' : 'var(--paper)',
              color: message.role === 'user' ? 'var(--paper)' : 'var(--ink)',
              border: message.role === 'user' ? 'none' : '1px solid var(--paper-edge)',
            }}>
              {message.text}
            </div>
          ))}
          {busy && sessionId && <div style={{ color: 'var(--ink-3)', fontSize: 12 }}>…</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--paper-edge)' }}>
          <input
            value={input}
            disabled={!sessionId || busy}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={sessionId ? '说说你想梦见什么……' : '请先开始预构'}
            style={{
              flex: 1, minWidth: 0, padding: '7px 9px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--paper-edge)', background: 'var(--paper)',
              color: 'var(--ink)', fontFamily: 'inherit', fontSize: 12.5,
            }}
          />
          <button style={buttonStyle} disabled={!sessionId || busy || !input.trim()} onClick={send}>发送</button>
        </div>
      </section>
    </div>
  );
}
