// See activity-api.test.ts for the co-located test convention this file follows.
import { describe, it, expect } from 'vitest';
import { parseIncremental } from './incrementalNarrativeParser';

function feedCharByChar(fullText: string): ReturnType<typeof parseIncremental>[] {
  const snapshots: ReturnType<typeof parseIncremental>[] = [];
  for (let i = 1; i <= fullText.length; i++) {
    snapshots.push(parseIncremental(fullText.slice(0, i)));
  }
  return snapshots;
}

describe('parseIncremental — markdown format', () => {
  const full = '*他笑了*\n\n你好呀\n\n> 窗外下雨\n\n_有点紧张_';

  it('final snapshot matches a whole-text parse of the same buffer', () => {
    const streamed = feedCharByChar(full);
    expect(streamed[streamed.length - 1]).toEqual(parseIncremental(full));
  });

  it('final snapshot resolves the expected segment type sequence', () => {
    const segs = parseIncremental(full);
    expect(segs.map(s => s.type)).toEqual(['do', 'say', 'env', 'feel']);
    expect(segs.map(s => s.text)).toEqual(['他笑了', '你好呀', '窗外下雨', '有点紧张']);
  });

  it('intermediate snapshots only ever use known segment types', () => {
    for (const snap of feedCharByChar(full)) {
      for (const seg of snap) {
        expect(['say', 'do', 'env', 'feel', 'narration']).toContain(seg.type);
      }
    }
  });

  it('renders an unclosed trailing *do* line optimistically while streaming', () => {
    const partial = '*他正要说话';
    const segs = parseIncremental(partial);
    expect(segs).toEqual([{ type: 'do', text: '他正要说话' }]);
  });

  it('renders an unclosed trailing _feel_ line optimistically while streaming', () => {
    const partial = '前面已经说完了\n\n_有点';
    const segs = parseIncremental(partial);
    expect(segs[segs.length - 1]).toEqual({ type: 'feel', text: '有点' });
  });

  it('optimistic do segment resolves into a finished do segment once closed', () => {
    const before = parseIncremental('*他正要说话');
    const after = parseIncremental('*他正要说话*');
    expect(before).toEqual([{ type: 'do', text: '他正要说话' }]);
    expect(after).toEqual([{ type: 'do', text: '他正要说话' }]);
  });

  it('a still-open env line renders immediately (no closing marker required)', () => {
    const segs = parseIncremental('> 窗外');
    expect(segs).toEqual([{ type: 'env', text: '窗外' }]);
  });

  it('empty input yields no segments', () => {
    expect(parseIncremental('')).toEqual([]);
  });
});

describe('parseIncremental — XML format', () => {
  const full = '<do>他笑了</do><say>你好呀</say><env>窗外下雨</env><feel>有点紧张</feel>';

  it('final snapshot matches a whole-text parse of the same buffer', () => {
    const streamed = feedCharByChar(full);
    expect(streamed[streamed.length - 1]).toEqual(parseIncremental(full));
  });

  it('final snapshot resolves the expected segment type sequence', () => {
    const segs = parseIncremental(full);
    expect(segs.map(s => s.type)).toEqual(['do', 'say', 'env', 'feel']);
    expect(segs.map(s => s.text)).toEqual(['他笑了', '你好呀', '窗外下雨', '有点紧张']);
  });

  it('auto-closes and optimistically renders an unclosed trailing tag while streaming', () => {
    const partial = '<do>他笑了</do><say>你好，还没说完';
    const segs = parseIncremental(partial);
    expect(segs).toEqual([
      { type: 'do', text: '他笑了' },
      { type: 'say', text: '你好，还没说完' },
    ]);
  });

  it('detects XML mode as soon as any known open tag appears mid-buffer', () => {
    const segs = parseIncremental('<say>');
    expect(segs).toEqual([]);
  });
});

describe('parseIncremental — mixed-format regression coverage', () => {
  it('unknown tags are dropped without losing surrounding text', () => {
    const segs = parseIncremental('<say>他说：<unknown>嗨</unknown>你好</say>');
    expect(segs).toEqual([{ type: 'say', text: '他说：嗨你好' }]);
  });

  it('char-by-char streaming never throws for either format', () => {
    const samples = [
      '*动作*\n\n> 环境描写\n\n对白内容\n\n_感受_',
      '<feel>紧张</feel><do>握紧了拳头</do><say>没事的</say>',
    ];
    for (const sample of samples) {
      expect(() => feedCharByChar(sample)).not.toThrow();
    }
  });
});
