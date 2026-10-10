import { useEffect, useRef, useState } from 'react';
import { wsClient } from '../../shared/api/ws';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { isSingleRealityMessage } from '../../shared/api/realityMessageScope';
import { VoiceMessageBar } from '../chat/components/VoiceMessageBar';
import { VnBubble } from './VnBubble';
import { claimSpeech } from './callSpeechDedup';
import { CallSpeechPlan, type SpeechLine } from './callSpeechPlan';
import { clearCallPerform, setCallPerform } from './callDirectiveLayers';

export function CallSpeechPresenter({ name, onPlayingChange }: { name: string; onPlayingChange: (playing: boolean) => void }) {
  const plan = useRef(new CallSpeechPlan());
  const generation = useRef(0);
  const [lines, setLines] = useState<SpeechLine[]>([]);
  const [playing, setPlaying] = useState(false);
  const publish = () => setLines([...plan.current.lines]);
  useEffect(() => {
    let alive = true;
    const reset = () => { generation.current++; plan.current.reset(); setLines([]); setPlaying(false); clearCallPerform(); };
    reset();
    const unMessage = wsClient.on('channel_message', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id) || !message.content.trim()) return;
      if (claimSpeech(message.msg_id, 1)) { plan.current.canonical(message.msg_id, message.content, performance.now()); plan.current.flush(performance.now()); publish(); }
    });
    const unSegments = wsClient.on('message_segments', message => {
      if (!isSingleRealityMessage(message, getActiveCharacterInfo().id)) return;
      plan.current.segments(message.msg_id, message.segments, performance.now()); plan.current.flush(performance.now());
      const current = plan.current.lines[0];
      if (current?.started && current.msgId === message.msg_id) setCallPerform(current.perform);
      publish();
    });
    const timer = setInterval(() => {
      if (!alive) return;
      const count = plan.current.lines.length; plan.current.flush(performance.now());
      if (plan.current.lines.length !== count) publish();
    }, 50);
    const unChar = subscribeActiveCharacter(reset);
    return () => { alive = false; generation.current++; clearInterval(timer); unMessage(); unSegments(); unChar(); plan.current.reset(); clearCallPerform(); onPlayingChange(false); };
  }, [onPlayingChange]);
  useEffect(() => onPlayingChange(playing), [onPlayingChange, playing]);
  const current = lines[0], token = generation.current;
  return <>
    {current && <>
      <VnBubble name={name} text={current.text} nameAlign="left" visible={playing} streaming={false} canAdvance={false}
        style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', maxWidth: '78%', minWidth: 200, zIndex: 10 }} />
      <VoiceMessageBar key={`${token}:${current.id}`} text={current.text} messageId={current.msgId} autoPlay scene="video_call" controlsVisible={false}
        onPlaybackStart={() => {
          if (generation.current !== token || plan.current.lines[0]?.id !== current.id) return;
          setCallPerform(plan.current.start(current.id)); setPlaying(true);
        }}
        onPlaybackEnd={() => {
          if (generation.current !== token || plan.current.lines[0]?.id !== current.id) return;
          clearCallPerform(); setPlaying(false); plan.current.finish(current.id); publish();
        }} />
    </>}
  </>;
}
