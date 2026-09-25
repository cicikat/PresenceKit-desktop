import { describe, expect, it } from 'vitest';
import { streamDisplayText } from './streamDisplay';
import { renderInlineStyled, spokenInlineText } from './inlineStyle';
import { renderToStaticMarkup } from 'react-dom/server';

describe('live inline display', () => {
  it('renders styles before canonical delivery, including an unfinished closing tag', () => {
    for (const text of ['<big>Hello', '<big>Hello</bi', '<big>Hello</big>']) {
      expect(renderToStaticMarkup(renderInlineStyled(streamDisplayText(text)))).toContain('font-size:1.18em');
      expect(renderToStaticMarkup(renderInlineStyled(streamDisplayText(text)))).not.toContain('&lt;big');
    }
  });
  it('withholds split style tokens without hiding ordinary comparisons', () => {
    expect(streamDisplayText('Hello <h')).toBe('Hello ');
    expect(streamDisplayText('1 < 2')).toBe('1 < 2');
  });
  it('keeps arbitrary HTML escaped and preserves complete adjacent styles', () => {
    const result = renderToStaticMarkup(renderInlineStyled(streamDisplayText('<hl>A</hl><sm>B</sm><script>alert(1)</script>')));
    expect(result).toContain('font-weight:600');
    expect(result).toContain('font-size:0.85em');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });
  it('keeps display tags out of speech while leaving arbitrary text intact', () => {
    expect(spokenInlineText('<hl>你好</hl><big>世界</big><script>x</script>'))
      .toBe('你好世界<script>x</script>');
  });
});
