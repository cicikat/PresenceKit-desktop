import { useEffect, useState } from 'react';
import { wsClient } from '../../shared/api/ws';
import { getActiveCharacterInfo } from '../../shared/activeCharacter';
import { isSingleRealityMessage } from '../../shared/api/realityMessageScope';
import { normalizeChatDisplayText } from '../chat/chatDisplay';
import { VoiceMessageBar } from '../chat/components/VoiceMessageBar';
import { VnBubble } from './VnBubble';
import { claimSpeech } from './callSpeechDedup';

interface SpeechLine { id: string; text: string }

function splitLines(text: string): string[] {
  return text.split(/\n+/).map(line => normalizeChatDisplayText(line).trim()).filter(Boolean);
}

export function CallSpeechPresenter({ name, onPlayingChange }: { name: string; onPlayingChange: (playing: boolean) => void }) {
  const [lines, setLines] = useState<SpeechLine[]>([]);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const enqueue = (msgId: string, texts: string[]) => {
      const next = texts.flatMap(splitLines).map((text, index) => ({ id: `${msgId}:${index}`, text }));
      if (!next.length || !claimSpeech(msgId, next.length)) return;
      setLines(current => [...current, ...next]);
    };
    const unMessage = wsClient.on('channel_message', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id) || !message.content.trim()) return;
      // Only the canonical event creates speech. Segments may arrive before or
      // after it and are a text sidecar, never another turn to speak.
      enqueue(message.msg_id, [message.content]);
    });
    return () => {
      unMessage();
    };
  }, []);

  useEffect(() => onPlayingChange(playing), [onPlayingChange, playing]);
  const current = lines[0];
  return <>
    {current && <>
      <VnBubble name={name} text={current.text} nameAlign="left" visible={playing} streaming={false} canAdvance={false}
        style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', maxWidth: '78%', minWidth: 200, zIndex: 10 }} />
      <VoiceMessageBar key={current.id} text={current.text} autoPlay scene="video_call" controlsVisible={false}
        onPlaybackStart={() => setPlaying(true)}
        onPlaybackEnd={() => { setPlaying(false); setLines(queue => queue.slice(1)); }} />
    </>}
  </>;
}
