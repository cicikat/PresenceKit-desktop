import { useEffect, useRef, useState } from 'react';
import { wsClient } from '../../shared/api/ws';
import { getActiveCharacterInfo } from '../../shared/activeCharacter';
import { isSingleRealityMessage } from '../../shared/api/realityMessageScope';
import { normalizeChatDisplayText } from '../chat/chatDisplay';
import { VoiceMessageBar } from '../chat/components/VoiceMessageBar';
import { VnBubble } from './VnBubble';

interface SpeechLine { id: string; text: string }

function splitLines(text: string): string[] {
  return text.split(/\n+/).map(line => normalizeChatDisplayText(line).trim()).filter(Boolean);
}

export function CallSpeechPresenter({ name, onPlayingChange }: { name: string; onPlayingChange: (playing: boolean) => void }) {
  const [lines, setLines] = useState<SpeechLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const seenRef = useRef(new Set<string>());
  const pendingRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const enqueue = (msgId: string, texts: string[]) => {
      if (seenRef.current.has(msgId)) return;
      seenRef.current.add(msgId);
      if (seenRef.current.size > 64) seenRef.current.delete(seenRef.current.values().next().value!);
      const next = texts.flatMap(splitLines).map((text, index) => ({ id: `${msgId}:${index}`, text }));
      if (next.length) setLines(current => [...current, ...next]);
    };
    const unSegments = wsClient.on('message_segments', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id)) return;
      const texts = (message.segments ?? []).map(segment => segment.text);
      if (!texts.some(text => text.trim())) return;
      const timer = pendingRef.current.get(message.msg_id);
      if (timer) clearTimeout(timer);
      pendingRef.current.delete(message.msg_id);
      enqueue(message.msg_id, texts);
    });
    const unMessage = wsClient.on('channel_message', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id) || !message.content.trim()) return;
      if (pendingRef.current.has(message.msg_id) || seenRef.current.has(message.msg_id)) return;
      pendingRef.current.set(message.msg_id, setTimeout(() => {
        pendingRef.current.delete(message.msg_id);
        enqueue(message.msg_id, [message.content]);
      }, 300));
    });
    return () => {
      unSegments();
      unMessage();
      for (const timer of pendingRef.current.values()) clearTimeout(timer);
      pendingRef.current.clear();
    };
  }, []);

  useEffect(() => onPlayingChange(playing), [onPlayingChange, playing]);
  const current = lines[0];
  return <>
    {current && <>
      <VnBubble name={name} text={current.text} nameAlign="left" visible={playing} streaming={false} canAdvance={false}
        style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', maxWidth: '78%', minWidth: 200, zIndex: 10 }} />
      <div className="call-room__tts" style={{ position: 'absolute', bottom: 100, left: 16, zIndex: 11, borderRadius: 8 }}>
        <VoiceMessageBar key={current.id} text={current.text} autoPlay scene="video_call"
          onPlaybackStart={() => setPlaying(true)}
          onPlaybackEnd={() => { setPlaying(false); setLines(queue => queue.slice(1)); }} />
      </div>
    </>}
  </>;
}
