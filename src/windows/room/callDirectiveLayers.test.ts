import { describe, expect, it } from 'vitest';
import { CallDirectiveLayers } from './callDirectiveLayers';
const baseline = { expression: 'neutral', intensity: 0.4, gaze: null, gesture: null, posture: null, speaking: null, energy: 0.5, ttl_ms: 6000 };
describe('Room-only expression layers', () => {
  it('late mood never steals a sentence, and clearing restores still-valid baseline', () => { const l = new CallDirectiveLayers(); l.setSentence({expression:'angry'},0); l.setBaseline(baseline,10); expect(l.get(20)?.expression).toBe('angry'); l.clearSentence(); expect(l.get(20)?.expression).toBe('neutral'); });
  it('null means no override, with independent expiration', () => { const l=new CallDirectiveLayers(); l.setBaseline(baseline,0); l.setSentence({head:'nod'},10); expect(l.get(20)?.expression).toBe('neutral'); expect(l.get(20)?.gesture).toBe('nod'); expect(l.get(7000)?.expression).toBeNull(); expect(l.get(31000)).toBeNull(); });
  it('missing perform clears previous segment rather than retaining anger', () => { const l=new CallDirectiveLayers(); l.setSentence({expression:'angry'},0); l.setSentence(undefined,100); expect(l.get(101)).toBeNull(); });
  it('reset isolates character and call lifetimes', () => { const l=new CallDirectiveLayers(); l.setSentence({expression:'sad'},0); l.reset(); expect(l.get(1)).toBeNull(); });
});
