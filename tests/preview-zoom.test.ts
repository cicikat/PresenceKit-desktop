import { describe, expect, it } from 'vitest';
import { injectPreviewZoom } from '../src/shared/chatAppearance';

describe('injectPreviewZoom', () => {
  it('默认字号不改动', () => {
    expect(injectPreviewZoom('<p>x</p>', 14)).toBe('<p>x</p>');
  });
  it('有 head 时插入 head 之后', () => {
    expect(injectPreviewZoom('<html><head><title>a</title></head></html>', 21))
      .toBe('<html><head><style>html{zoom:1.5}</style><title>a</title></head></html>');
  });
  it('没有 head 时插入开头', () => {
    expect(injectPreviewZoom('<p>x</p>', 7)).toBe('<style>html{zoom:0.5}</style><p>x</p>');
  });
});
