import { describe, expect, it } from 'vitest';
import { CharacterBehaviorState } from './behaviorState';
import { CHARACTER_BEHAVIOR as P } from './behaviorParameters';
const charId = 'test';
describe('character chat/audio arbitration', () => {
  it('send -> thinking -> stream/text speaking -> idle without losing trusted sadness', () => {
    const s = new CharacterBehaviorState();
    s.notice({ kind: 'request-start', id: 'req', charId, at: 0 });
    expect(s.frame(0, '平静').activity).toBe('thinking');
    s.streamStart('msg', 100); s.streamDelta('msg', 'hello', 200);
    expect(s.frame(200, '平静').activity).toBe('speaking');
    s.segments('msg', [{ type: 'say', text: 'hello', perform: { expression: 'sad' } }], 210);
    s.streamEnd('msg', 300);
    s.notice({ kind: 'request-end', id: 'req', charId, at: 400, msgId: 'msg', text: 'hello' });
    expect(s.frame(401, '平静')).toEqual({ activity: 'speaking', expression: 'sad' });
    expect(s.frame(3000, '平静')).toEqual({ activity: 'idle', expression: 'sad' });
    // A newer authoritative StateEngine mood wins over the transient sentence emotion.
    expect(s.frame(3001, '开心').expression).toBe('happy');
  });
  it('actual audio owns speaking beyond text TTL and end/pause returns to retained emotion', () => {
    const s = new CharacterBehaviorState();
    s.canonical('msg', 'Hello', 0);
    s.segments('msg', [{ type: 'say', text: 'Hello', perform: { expression: 'angry' } }], 1);
    s.notice({ kind: 'audio-start', id: 'audio', charId, at: 500, msgId: 'msg', scene: 'chat' });
    expect(s.frame(20000, '平静')).toEqual({ activity: 'speaking', expression: 'angry' });
    s.notice({ kind: 'audio-end', id: 'audio', charId, at: 20001, msgId: 'msg', scene: 'chat' });
    expect(s.frame(20001, '平静')).toEqual({ activity: 'idle', expression: 'angry' });
    // A late canonical duplicate does not replay speech.
    s.canonical('msg', 'Hello', 20002);
    expect(s.frame(20002, '平静').activity).toBe('idle');
  });
  it('audio end does not release a newer request, text reply or another playback', () => {
    const s = new CharacterBehaviorState();
    s.canonical('old', 'old', 0);
    s.notice({ kind: 'audio-start', id: 'a', charId, at: 1, msgId: 'old', scene: 'desktop_pet' });
    s.notice({ kind: 'request-start', id: 'new', charId, at: 2 });
    s.notice({ kind: 'audio-end', id: 'a', charId, at: 3, scene: 'desktop_pet' });
    expect(s.frame(3, '平静').activity).toBe('thinking');
    s.canonical('new-msg', 'new text', 4);
    s.notice({ kind: 'audio-end', id: 'a', charId, at: 5, scene: 'desktop_pet' });
    expect(s.frame(5, '平静').activity).toBe('speaking');
  });
  it('old HTTP completions cannot overwrite a newer trusted emotion', () => {
    const s = new CharacterBehaviorState();
    s.notice({ kind: 'request-start', id: 'old', charId, at: 0 });
    s.notice({ kind: 'request-start', id: 'new', charId, at: 1 });
    s.notice({ kind: 'request-end', id: 'new', charId, at: 2, text: 'new', emotion: 'happy' });
    s.notice({ kind: 'request-end', id: 'old', charId, at: 3, text: 'old', emotion: 'angry' });
    expect(s.frame(3, '平静').expression).toBe('happy');
  });
  it('requires a registered stream and structured emotion; words never trigger angry/sad', () => {
    const s = new CharacterBehaviorState();
    s.streamDelta('unowned', 'angry and sad!', 0); s.streamEnd('unowned', 1);
    expect(s.frame(1, '平静').activity).toBe('idle');
    s.canonical('text', 'I am angry and sad', 2);
    expect(s.frame(2, '平静').expression).toBe('neutral');
    s.segments('text', [{ type: 'feel', text: 'angry', perform: { expression: 'angry' } }], 3);
    expect(s.frame(3, '平静').expression).toBe('neutral');
  });
  it('expires stalled requests/streams/audio and ignores a late end from a reset generation', () => {
    const s = new CharacterBehaviorState();
    s.notice({ kind: 'request-start', id: 'r', charId, at: 0 });
    expect(s.frame(P.feedback.requestTtlMs + 1, '平静').activity).toBe('idle');
    s.streamStart('s', 100000); s.streamDelta('s', 'hi', 100001);
    expect(s.frame(100001 + P.feedback.streamTtlMs + 1, '平静').activity).toBe('idle');
    s.reset();
    s.notice({ kind: 'request-end', id: 'r', charId, at: 150000, text: 'late', emotion: 'angry' });
    expect(s.frame(150000, '平静')).toEqual({ activity: 'idle', expression: 'neutral' });
    s.notice({ kind: 'audio-end', id: 'audio', charId, at: 150001, scene: 'chat' });
    s.notice({ kind: 'audio-start', id: 'audio', charId, at: 150000, scene: 'chat' }, 150002);
    expect(s.frame(150002, '平静').activity).toBe('idle');
    s.notice({ kind: 'audio-start', id: 'other', charId, at: 150003, scene: 'chat' });
    expect(s.frame(150003 + P.feedback.audioTtlMs + 1, '平静').activity).toBe('idle');
  });
  it('never animates Dream audio and accepts explicit neutral to clear a trusted expression', () => {
    const s = new CharacterBehaviorState();
    s.notice({ kind: 'audio-start', id: 'dream', charId, at: 0, scene: 'dream' });
    expect(s.frame(1, '平静').activity).toBe('idle');
    s.segments('msg', [{ type: 'say', text: 'a', perform: { expression: 'sad' } }], 2);
    s.canonical('msg', 'a', 3);
    expect(s.frame(4, '平静').expression).toBe('sad');
    s.canonical('next', 'b', 5);
    s.segments('next', [{ type: 'say', text: 'b', perform: { expression: 'neutral' } }], 6);
    expect(s.frame(3000, '平静').expression).toBe('neutral');
  });
});
