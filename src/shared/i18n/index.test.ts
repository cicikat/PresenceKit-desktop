import { describe, expect, it } from 'vitest';
import { translateLegacyText } from './legacy';

describe('legacy i18n compatibility', () => {
  it('translates exact existing UI copy', () => expect(translateLegacyText('系统设置')).toBe('System'));
  it('preserves surrounding whitespace', () => expect(translateLegacyText('  偏好  ')).toBe('  Preferences  '));
  it('does not alter unknown content', () => expect(translateLegacyText('叶瑄说今天下雨了')).toBe('叶瑄说今天下雨了'));
});
