import { describe, expect, it } from 'vitest';
import { shouldUseCallAudio } from './callPresentationMode';
describe('Room text/audio subtitle ownership', () => {
  it.each([[false,false,false],[false,true,false],[true,false,false],[true,true,true]])(
    'TTS %s / call autoplay %s -> audio %s', (enabled, auto, expected) => {
      expect(shouldUseCallAudio(enabled,auto)).toBe(expected);
    });
});
