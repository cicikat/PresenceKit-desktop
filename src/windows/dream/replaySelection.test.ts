import { describe, expect, it } from 'vitest';
import { isCurrentReplayRequest, mapArchiveMessages } from './replaySelection';

describe('isCurrentReplayRequest', () => {
  it('accepts the response for the selected current session', () => {
    expect(isCurrentReplayRequest(4, 4, 'dream-4', 'dream-4')).toBe(true);
  });

  it('rejects an older response after the selection changes', () => {
    expect(isCurrentReplayRequest(3, 4, 'dream-4', 'dream-3')).toBe(false);
  });

  it('rejects a response after replay selection is cleared', () => {
    expect(isCurrentReplayRequest(4, 4, null, 'dream-4')).toBe(false);
  });

  it('maps static archive roles to the existing Dream message model', () => {
    expect(mapArchiveMessages('dream-4', [
      { role: 'assistant', content: 'a remembered reply', ts: 10 },
      { role: 'user', content: 'a remembered prompt', ts: 11 },
    ], 8)).toEqual([
      { id: 'replay:dream-4:8', role: 'her', text: 'a remembered reply' },
      { id: 'replay:dream-4:9', role: 'user', text: 'a remembered prompt' },
    ]);
  });

  it('maps backend segments and stripped content without invoking live behavior', () => {
    expect(mapArchiveMessages('dream-segments', [
      {
        role: 'assistant',
        content: '<say>你好</say><do>抬头</do>',
        segmented_content: '你好\n抬头',
        segments: [
          { type: 'say', text: '你好' },
          { type: 'do', text: '抬头' },
        ],
        ts: 10,
      },
    ])).toEqual([{
      id: 'replay:dream-segments:0',
      role: 'her',
      text: '<say>你好</say><do>抬头</do>',
      segmentedContent: '你好\n抬头',
      segments: [
        { type: 'say', text: '你好' },
        { type: 'do', text: '抬头' },
      ],
    }]);
  });
});
