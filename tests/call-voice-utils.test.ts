import { describe, expect, it } from 'vitest';
import { canAutoSend, joinTranscript, shouldCutSegment } from '../src/windows/room/callVoiceUtils';

describe('joinTranscript', () => {
  it('中文之间不加空格', () => expect(joinTranscript('我今天', '有点累')).toBe('我今天有点累'));
  it('英文之间保留空格', () => expect(joinTranscript('hello', 'world')).toBe('hello world'));
  it('中英交界加空格', () => expect(joinTranscript('我用', 'iPhone')).toBe('我用 iPhone'));
  it('空串', () => { expect(joinTranscript('', 'a')).toBe('a'); expect(joinTranscript('a', '')).toBe('a'); });
});

describe('canAutoSend', () => {
  const base = { transcribing: false, pendingCount: 0, isVoiceActive: false, lastVoiceAt: 1000 };
  it('安静够久才发', () => {
    expect(canAutoSend(base, 2400)).toBe(false);
    expect(canAutoSend(base, 2500)).toBe(true);
  });
  it('在途/排队/正在说都不发', () => {
    expect(canAutoSend({ ...base, transcribing: true }, 9999)).toBe(false);
    expect(canAutoSend({ ...base, pendingCount: 1 }, 9999)).toBe(false);
    expect(canAutoSend({ ...base, isVoiceActive: true }, 9999)).toBe(false);
  });
});

describe('shouldCutSegment', () => {
  it('900ms 静音切', () => expect(shouldCutSegment(2000, 900, 5)).toBe(true));
  it('4s 后 300ms 短停顿切', () => {
    expect(shouldCutSegment(3000, 400, 5)).toBe(false);
    expect(shouldCutSegment(4200, 300, 5)).toBe(true);
  });
  it('8s 绝对上限', () => expect(shouldCutSegment(8000, 0, 5)).toBe(true));
  it('无声不切', () => expect(shouldCutSegment(5000, 5000, 1)).toBe(false));
});
