import { describe, expect, it } from 'vitest';
import { resolveLegacyOriginal } from './index';
import { translateLegacyText } from './legacy';

describe('legacy i18n compatibility', () => {
  it('translates exact existing UI copy', () => expect(translateLegacyText('系统设置')).toBe('System'));
  it('preserves surrounding whitespace', () => expect(translateLegacyText('  偏好  ')).toBe('  Preferences  '));
  it('does not alter unknown content', () => expect(translateLegacyText('叶瑄说今天下雨了')).toBe('叶瑄说今天下雨了'));
});

describe('resolveLegacyOriginal', () => {
  it('preserves the source text during a forced language render', () => {
    expect(resolveLegacyOriginal('Preferences', '偏好', 'Preferences', true)).toBe('偏好');
  });

  it('accepts application-driven text changes observed between language renders', () => {
    expect(resolveLegacyOriginal('保存中…', '保存', 'Save', false)).toBe('保存中…');
  });

  it('ignores mutations produced by the translation bridge itself', () => {
    expect(resolveLegacyOriginal('Save', '保存', 'Save', false)).toBe('保存');
  });
});
