import type { MainLayoutId, SlotId } from './contract';

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
  /** Optional V2 template for the stable regions inside the main chat area. */
  mainLayout?: MainLayoutId;
  css?: string;
}

export type LayoutSource = 'builtin' | 'disk';

export interface LayoutRecord {
  manifest: LayoutManifest;
  source: LayoutSource;
  cssText?: string;
}
