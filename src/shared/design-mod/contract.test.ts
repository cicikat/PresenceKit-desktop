import { describe, expect, it } from 'vitest';
import { DESIGN_MOD_DEFAULT_ID, DESIGN_COMPONENT_IDS, isDesignComponentOwnershipConflict, selectDesignMod, validateDesignModManifest, validateDesignModPackage } from './contract';

const valid = {
  schemaVersion: 1,
  id: 'sample-design',
  name: 'Sample',
  author: 'test',
  version: '1.0.0',
  entry: 'entry.js',
};

describe('trusted design Mod contract', () => {
  it('accepts a single-file ESM manifest and rejects unsafe paths', () => {
    expect(validateDesignModManifest(valid)).toEqual([]);
    expect(validateDesignModManifest({ ...valid, id: '../escape' })).toContain('id 必须是安全的单级目录名');
    expect(validateDesignModManifest({ ...valid, entry: 'runtime.js?x' })).toContain('entry 必须是同包内的 .js 路径');
    expect(validateDesignModManifest({ ...valid, style: 'https://example.invalid/style.css' })).toContain('style 必须是同包内的 .css 路径');
  });

  it('keeps theme and layout validation independent and atomic', () => {
    const errors = validateDesignModPackage({ ...valid, theme: 'theme/theme.json', layout: 'layout/layout.json' }, {
      theme: { id: 'sample', name: 'Sample', tokens: {} },
      layout: { id: 'sample', name: 'Sample', direction: 'row', slots: {} },
    });
    expect(errors.some(error => error.startsWith('theme:'))).toBe(true);
    expect(errors.some(error => error.startsWith('layout:'))).toBe(true);
  });

  it('selects the requested record and falls back to builtin-default', () => {
    const records = [{ manifest: { id: DESIGN_MOD_DEFAULT_ID } }, { manifest: { id: 'fixture' } }];
    expect(selectDesignMod(records, 'fixture')?.manifest.id).toBe('fixture');
    expect(selectDesignMod(records, 'missing')?.manifest.id).toBe(DESIGN_MOD_DEFAULT_ID);
    expect(DESIGN_COMPONENT_IDS).toHaveLength(15);
    expect(isDesignComponentOwnershipConflict('chat.sidebar.flow', 'chat.sidebar.flow.now')).toBe(true);
    expect(isDesignComponentOwnershipConflict('chat.sidebar.flow', 'chat.sidebar.garden')).toBe(false);
  });
});
