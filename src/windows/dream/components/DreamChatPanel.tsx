import { useState, useEffect, useRef, memo } from 'react';
import type { DreamMessage } from '../../../shared/api/dream-types';
import { DreamSceneBlock } from './DreamSceneBlock';
import { avatarStore } from '../../../shared/avatars/store';
import { DreamGlowBubble } from './DreamGlowBubble';

interface DreamChatPanelProps {
  messages: DreamMessage[];
  loading: boolean;
  inputDisabled: boolean;
  onSend: (text: string) => void;
  endedMessage?: string;
}

type BubbleLine = { kind: 'action' | 'text'; content: string };

function splitIntoBubbles(text: string): string[] {
  const normalized = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return normalized.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
}

function renderBubbleLines(segment: string): BubbleLine[] {
  return segment
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => ({
      kind: /^[（(].+[）)]$/.test(line) ? 'action' : 'text',
      content: line,
    }));
}

function DreamHerAvatar({ herDataUrl }: { herDataUrl: string | null }) {
  if (herDataUrl) {
    return <img src={herDataUrl} className="dream-msg__avatar" alt="" />;
  }
  return <div className="dream-msg__avatar-dot" />;
}

const DreamMsgRow = memo(function DreamMsgRow({
  msg,
  herDataUrl,
}: {
  msg: DreamMessage;
  herDataUrl: string | null;
}) {
  if (msg.role === 'system') {
    return <DreamSceneBlock text={msg.text} />;
  }

  const fromUser = msg.role === 'user';
  const displayText = msg.segmentedContent ?? msg.text;
  const bubbles = fromUser ? null : splitIntoBubbles(displayText);

  return (
    <div className={`dream-msg${fromUser ? ' dream-msg--user' : ' dream-msg--her'}`}>
      {!fromUser && <DreamHerAvatar herDataUrl={herDataUrl} />}
      <div className="dream-msg__content">
        {bubbles ? (
          <div className="dream-msg__bubbles">
            {bubbles.map((segment, bi) => (
              <DreamGlowBubble key={bi} side="left" speaker={bi === 0 ? 'HIM' : undefined}>
                {renderBubbleLines(segment).map((line, i) => (
                  <p
                    key={i}
                    className={line.kind === 'action' ? 'dream-bubble__action' : undefined}
                  >
                    {line.content}
                  </p>
                ))}
              </DreamGlowBubble>
            ))}
          </div>
        ) : (
          <DreamGlowBubble side="right" speaker="YOU">{displayText}</DreamGlowBubble>
        )}
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
  const [herDataUrl, setHerDataUrl] = useState<string | null>(avatarStore.get().her.dataUrl);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => avatarStore.subscribe(a => setHerDataUrl(a.her.dataUrl)), []);

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
          <DreamMsgRow key={m.id} msg={m} herDataUrl={herDataUrl} />
        ))}

        {loading && (
          <div className="dream-msg dream-msg--her">
            <DreamHerAvatar herDataUrl={herDataUrl} />
            <div className="dream-msg__content">
              <DreamGlowBubble side="left" speaker="HIM" className="dream-glow-bubble--typing">
                <span className="dream-typing-dots"><i /><i /><i /></span>
              </DreamGlowBubble>
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
