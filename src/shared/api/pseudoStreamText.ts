import { wsClient } from './ws';

/**
 * Dream / coplay / activity chat endpoints are still plain HTTP request-response
 * (Brief 84, Emerald-presence): the backend now plays a server-side typewriter
 * replay over the same WS connection *before* the HTTP call resolves, reusing the
 * 1v1 `message_stream_start/delta/end` frame contract, but there is no canonical
 * WS message to key off — the final text only ever arrives via the HTTP response.
 *
 * These frames carry `char_id` but never `round_id` (Stage group frames always
 * carry `round_id`; 1v1 owner frames carry no `char_id` at all) — that combination
 * is what tells "this HTTP call's animation" apart from Stage/1v1 traffic sharing
 * the same WS connection. Call disarm() once the awaited HTTP response settles
 * (success or error) so frames from unrelated activity can't leak into a later call.
 */
export function armHttpPseudoStream(onDelta: (delta: string) => void): () => void {
  let matchedMsgId: string | null = null;
  let disarmed = false;

  const unsubStart = wsClient.on('message_stream_start', ({ msg_id, char_id, round_id }) => {
    if (disarmed || matchedMsgId !== null) return;
    if (!char_id || round_id) return;
    matchedMsgId = msg_id;
  });
  const unsubDelta = wsClient.on('message_stream_delta', ({ msg_id, delta }) => {
    if (disarmed || msg_id !== matchedMsgId) return;
    onDelta(delta);
  });

  return () => {
    disarmed = true;
    unsubStart();
    unsubDelta();
  };
}
