import type { LayoutManifest } from '../layout/types';
import type { ThemeManifest } from '../theme/types';
import type { SurfaceCapabilityResult } from './capabilities';

export const DESIGN_MOD_SCHEMA_VERSION = 2 as const;
export const DESIGN_MOD_LEGACY_SCHEMA_VERSION = 1 as const;

export type DesignModId = string;
export type DesignModSource = 'builtin' | 'design-mod';
export type DesignSurface = 'main' | 'satellite';
export type DesignModPhase = 'idle' | 'loading' | 'activating' | 'active' | 'error';

export type NativeSurfaceKind = 'halo' | 'island';
export type NativeSurfacePointerMode = 'passthrough' | 'interactive';
export type NativeSurfaceZOrder = 'owned' | 'always-on-top';
export type NativeSurfaceAnchor = 'main.top' | 'main.right' | 'main.bottom' | 'main.left';

export interface NativeSurfaceSize {
  width: number;
  height: number;
}

export interface NativeSurfaceOffset {
  x?: number;
  y?: number;
}

export interface NativeSurfaceMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NativeSurfaceInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface NativeSurfaceManifest {
  id: string;
  kind: NativeSurfaceKind;
  entry: string;
  style?: string;
  pointerMode: NativeSurfacePointerMode;
  zOrder: NativeSurfaceZOrder;
  size: NativeSurfaceSize;
  /** Extra transparent window area reserved for transformed visual output. */
  visualBleed?: number | NativeSurfaceInsets;
  /** Inset rectangle reserved for normal content inside the visual window. */
  contentInset?: number | NativeSurfaceInsets;
  /** @deprecated Use visualBleed for surface bounds. */
  margin?: number | NativeSurfaceMargin;
  anchor?: NativeSurfaceAnchor;
  offset?: NativeSurfaceOffset;
  requires?: string[];
}

export interface DesignModManifest {
  schemaVersion: typeof DESIGN_MOD_SCHEMA_VERSION | typeof DESIGN_MOD_LEGACY_SCHEMA_VERSION;
  id: DesignModId;
  name: string;
  author: string;
  version: string;
  entry: string;
  style?: string;
  theme?: string;
  layout?: string;
  nativeSurfaces?: NativeSurfaceManifest[];
}
export interface DesignModRecord {
  manifest: DesignModManifest;
  source: DesignModSource;
  theme?: ThemeManifest;
  themeCss?: string | null;
  layout?: LayoutManifest;
  layoutCss?: string | null;
  nativeSurfaceAvailability?: SurfaceCapabilityResult[];
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
  nativeSurfacePackages: NativeSurfacePackage[];
}

export interface NativeSurfacePackage extends NativeSurfaceManifest {
  entrySource: string;
  styleText?: string | null;
}
