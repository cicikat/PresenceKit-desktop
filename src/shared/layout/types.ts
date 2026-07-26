import type { SlotId } from './contract';

export interface SlotSpec {
  order: number;
  size?: number;
  hidden?: boolean;
}

export interface LayoutManifest {
  id: string;
  name: string;
  author: string;
  version: string;
  direction: 'row' | 'row-reverse';
  slots: Record<SlotId, SlotSpec>;
  css?: string;
}

export type LayoutSource = 'builtin' | 'disk';

export interface LayoutRecord {
  manifest: LayoutManifest;
  source: LayoutSource;
  cssText?: string;
}
