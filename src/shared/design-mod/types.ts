import type { LayoutManifest } from '../layout/types';
import type { ThemeManifest } from '../theme/types';

export const DESIGN_MOD_SCHEMA_VERSION = 1 as const;

export type DesignModId = string;
export type DesignModSource = 'builtin' | 'design-mod';
export type DesignSurface = 'main' | 'satellite';
export type DesignModPhase = 'idle' | 'loading' | 'activating' | 'active' | 'error';

export interface DesignModManifest {
  schemaVersion: typeof DESIGN_MOD_SCHEMA_VERSION;
  id: DesignModId;
  name: string;
  author: string;
  version: string;
  entry: string;
  style?: string;
  theme?: string;
  layout?: string;
}
export interface DesignModRecord {
  manifest: DesignModManifest;
  source: DesignModSource;
  theme?: ThemeManifest;
  themeCss?: string | null;
  layout?: LayoutManifest;
  layoutCss?: string | null;
}

export interface DesignModDiagnostic {
  phase: DesignModPhase;
  message: string;
  error?: string;
  updatedAt: number;
}

export interface DesignModPackage extends DesignModRecord {
  entrySource: string;
  styleText?: string | null;
  assetRootId: string;
}
