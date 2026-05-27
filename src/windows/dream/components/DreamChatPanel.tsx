import { useState, useEffect, useRef, memo } from 'react';
import type { DreamMessage } from '../../../shared/api/dream-types';
import { DreamSceneBlock } from './DreamSceneBlock';

interface DreamChatPanelProps {
  messages: DreamMessage[];
  loading: boolean;
  inputDisabled: boolean;
  onSend: (text: string) => void;
  endedMessage?: string;
}

const DreamMsgRow = memo(function DreamMsgRow({ msg }: { msg: DreamMessage }) {
  if (msg.role === 'system') {
    return <DreamSceneBlock text={msg.text} />;
  }

  const fromUser = msg.role === 'user';

  return (
    <div className={`dream-msg${fromUser ? ' dream-msg--user' : ' dream-msg--her'}`}>
      {!fromUser && <div className="dream-msg__avatar-dot" />}
      <div className="dream-msg__content">
        <div className="dream-msg__meta">{fromUser ? 'YOU' : 'HER'}</div>
        <div className="dream-msg__bubble">{msg.text}</div>
      </div>
    </div>
  );
});

export function DreamChatPanel({
  messages,
  loading,
  inputDisabled,
  onSend,
  endedMessage,
}: DreamChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const handleSend = () => {
    const t = input.trim();
    if (!t || inputDisabled) return;
    setInput('');
    onSend(t);
  };

  return (
    <div className="dream-chat">
      <div ref={scrollRef} className="dream-chat__scroll">
        {endedMessage && (
          <div className="dream-chat__afterglow">
            <span className="dream-afterglow__dot" />
            <span>{endedMessage}</span>
          </div>
        )}

        {messages.map(m => (
          <DreamMsgRow key={m.id} msg={m} />
        ))}

        {loading && (
          <div className="dream-msg dream-msg--her">
            <div className="dream-msg__avatar-dot" />
            <div className="dream-msg__content">
              <div className="dream-msg__meta">HER</div>
              <div className="dream-msg__bubble dream-msg__bubble--typing">
                <span className="dream-typing-dots"><i /><i /><i /></span>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .dream-typing-dots i {
            display: inline-block; width: 5px; height: 5px; border-radius: 50%;
            background: var(--dt-ink-3); margin: 0 2px;
            animation: dream-dot 1.2s ease-in-out infinite;
          }
          .dream-typing-dots i:nth-child(2) { animation-delay: 0.18s; }
          .dream-typing-dots i:nth-child(3) { animation-delay: 0.36s; }
          @keyframes dream-dot {
            0%, 100% { opacity: 0.3; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-3px); }
          }
        `}</style>
      </div>

      <div className="dream-chat__input-bar">
        <div className="dream-chat__input-row">
          <textarea
            className="dream-chat__textarea"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={inputDisabled ? '梦已关闭' : '在这儿写点什么 …'}
            disabled={inputDisabled}
            rows={1}
          />
          <button
            className="dream-chat__send-btn"
            onClick={handleSend}
            disabled={inputDisabled}
          >
            寄出
          </button>
        </div>
        <div className="dream-chat__hints">
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--dt-ink-4)', letterSpacing: 1.2 }}>
            ENTER 发送 · SHIFT+ENTER 换行
          </span>
        </div>
      </div>
    </div>
  );
}
