import { useState, useEffect, useRef, memo } from 'react';
import type { DreamMessage } from '../../../shared/api/dream-types';
import type { NarrativeSegment } from '../../../shared/api/types';
import { DreamSceneBlock } from './DreamSceneBlock';
import { DreamGlowBubble } from './DreamGlowBubble';
import { TypingDots } from '../../../shared/ui/TypingDots';

interface DreamChatPanelProps {
  messages: DreamMessage[];
  loading: boolean;
  inputDisabled: boolean;
  herDataUrl: string | null;
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

function splitSegmentLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function normalizeDreamDialogueDisplayText(text: string): string {
  return text
    .replace(/^“([\s\S]*)”$/, '$1')
    .replace(/^"([\s\S]*)"$/, '$1');
}

function DreamSegmentedReply({
  segments,
  herDataUrl,
}: {
  segments: NarrativeSegment[];
  herDataUrl: string | null;
}) {
  let hasSaySpeaker = false;

  return (
    <div className="dream-msg__segments">
      {segments.map((segment, segmentIndex) => {
        if (segment.type === 'say') {
          const lines = splitSegmentLines(segment.text);
          if (lines.length === 0) return null;

          const showSpeaker = !hasSaySpeaker;
          hasSaySpeaker = true;

          return (
            <div
              key={segmentIndex}
              className={`dream-segment-say${showSpeaker ? ' dream-segment-say--with-speaker' : ''}`}
            >
              <DreamHerAvatar herDataUrl={herDataUrl} />
              <div className="dream-segment-say__bubbles">
                {lines.map((line, lineIndex) => (
                  <DreamGlowBubble
                    key={`${segmentIndex}-${lineIndex}`}
                    side="left"
                    speaker={showSpeaker && lineIndex === 0 ? 'HIM' : undefined}
                    className="dream-glow-bubble--say"
                  >
                    {normalizeDreamDialogueDisplayText(line)}
                  </DreamGlowBubble>
                ))}
              </div>
            </div>
          );
        }

        return (
          <p
            key={segmentIndex}
            className={`dream-segment dream-segment--${segment.type}`}
          >
            {segment.text}
          </p>
        );
      })}
    </div>
  );
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
      {!fromUser && !msg.segments?.length && <DreamHerAvatar herDataUrl={herDataUrl} />}
      <div className={`dream-msg__content${!fromUser && msg.segments?.length ? ' dream-msg__content--segmented' : ''}`}>
        {!fromUser && msg.segments?.length ? (
          <DreamSegmentedReply segments={msg.segments} herDataUrl={herDataUrl} />
        ) : bubbles ? (
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
  herDataUrl,
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
          <DreamMsgRow key={m.id} msg={m} herDataUrl={herDataUrl} />
        ))}

        {loading && (
          <div className="dream-msg dream-msg--her">
            <div className="dream-msg__content">
              <DreamGlowBubble side="left" speaker="HIM" className="dream-glow-bubble--typing">
                <TypingDots color="var(--dt-ink-3)" />
              </DreamGlowBubble>
            </div>
          </div>
        )}
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
            placeholder={inputDisabled ? '梦在进行' : '在这儿写点什么 …'}
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
