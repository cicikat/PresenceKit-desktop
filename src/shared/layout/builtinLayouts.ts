import type { LayoutManifest } from './types';

// Mirrors the pre-registry ChatWindow layout exactly: 52px ribbon, a 340px
// open sidebar, and the remaining space reserved for the primary content.
export const OBSIDIAN_DEFAULT_LAYOUT: LayoutManifest = {
  id: 'obsidian-default',
  name: 'Obsidian 默认布局',
  author: 'Emerald',
  version: '1.0.0',
  direction: 'row',
  slots: {
    ribbon: { order: 0, size: 52 },
    sidebar: { order: 1, size: 340 },
    main: { order: 2 },
  },
};

export const BUILTIN_LAYOUTS: LayoutManifest[] = [OBSIDIAN_DEFAULT_LAYOUT];
