import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../activeCharacter';
import { listenPetTurn, type PetTurnEvent } from '../pet/bridge';
import { wsClient } from '../api/ws';
import { isSingleRealityMessage, isSingleRealityStream } from '../api/realityMessageScope';
import { BEHAVIOR_EVENT, CharacterBehaviorState, type BehaviorNotice } from './behaviorState';

/** One controller per stage; scopes and token lifetimes survive React re-renders. */
export function useCharacterBehavior(surface: 'pet' | 'room'): CharacterBehaviorState {
  const ref = useRef<CharacterBehaviorState | null>(null);
  if (!ref.current) ref.current = new CharacterBehaviorState();
  const state = ref.current;
  useEffect(() => {
    let alive = true;
    const off: (() => void)[] = [];
    const add = async (subscription: Promise<() => void>) => {
      try { const fn = await subscription; if (alive) off.push(fn); else fn(); }
      catch (error) { console.warn('[character] behavior subscription unavailable:', error); }
    };
    const reset = () => state.reset();
    off.push(subscribeActiveCharacter(reset));
    void add(listen<BehaviorNotice>(BEHAVIOR_EVENT, e => {
      if (alive && e.payload.charId === getActiveCharacterInfo().id) state.notice(e.payload, Date.now());
    }));
    const accept = (turn: PetTurnEvent) => {
      if (!alive) return;
      const id = getActiveCharacterInfo().id, now = Date.now();
      switch (turn.kind) {
        case 'channel_message': if (isSingleRealityMessage(turn, id)) state.canonical(turn.msg_id, turn.content, now); break;
        case 'message_segments': if (isSingleRealityMessage(turn, id)) state.segments(turn.msg_id, turn.segments, now); break;
        case 'message_stream_start': if (isSingleRealityStream(turn, id)) state.streamStart(turn.msg_id, now); break;
        // An accepted start is required; scope-less legacy deltas cannot create a stream.
        case 'message_stream_delta': state.streamDelta(turn.msg_id, turn.delta, now); break;
        case 'message_stream_end': state.streamEnd(turn.msg_id, now); break;
      }
    };
    if (surface === 'pet') void add(listenPetTurn(accept));
    else off.push(
      wsClient.on('channel_message', m => accept({ kind: 'channel_message', ...m })),
      wsClient.on('message_segments', m => accept({ kind: 'message_segments', ...m })),
      wsClient.on('message_stream_start', m => accept({ kind: 'message_stream_start', ...m })),
      wsClient.on('message_stream_delta', m => { if (isSingleRealityMessage(m, getActiveCharacterInfo().id)) accept({ kind: 'message_stream_delta', ...m }); }),
      wsClient.on('message_stream_end', m => { if (isSingleRealityMessage(m, getActiveCharacterInfo().id)) accept({ kind: 'message_stream_end', ...m }); }),
    );
    return () => { alive = false; off.forEach(fn => fn()); reset(); };
  }, [surface, state]);
  return state;
}
