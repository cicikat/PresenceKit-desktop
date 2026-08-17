import type { DesignComponentId } from './contract';
import type { ViewportSnapshot } from './signals';
import { formatDiagnostic } from './runtime';
import type { DesignModHostPhase } from './hostLayout';
import type { DesignModDiagnostic, DesignModManifest, DesignModRecord, DesignSurface } from './types';
import type { DesignSatelliteDiagnostic } from './satellite';

export interface DesignModHostDiagnostic {
  phase: DesignModHostPhase;
  defaultShellVisible: boolean;
  modLayerVisible: boolean;
  attached: DesignComponentId[];
  viewport: Pick<ViewportSnapshot, 'width' | 'height' | 'devicePixelRatio'>;
  recoveryEntry: {
    visible: boolean;
    open: boolean;
    canOpenPreferences: boolean;
    canRestoreDefault: boolean;
  };
}

export interface DesignModDiagnostics {
  manifest: DesignModManifest | null;
  available: DesignModRecord[];
  diagnostic: DesignModDiagnostic;
  attached: DesignComponentId[];
  activeSubscriptions: number;
  fps: number;
  surface: DesignSurface;
  presenters: Record<string, PresenterDiagnostic>;
  surfaces: DesignSatelliteDiagnostic[];
  host: DesignModHostDiagnostic;
}

export interface PresenterDiagnostic {
  schemaVersion?: number;
  consumerCount: number;
  active: boolean;
  timerActive: boolean;
  updatedAt: number;
}

let latestDiagnostics: DesignModDiagnostics = {
  manifest: null,
  available: [],
  diagnostic: formatDiagnostic('idle', 'builtin-default'),
  attached: [],
  activeSubscriptions: 0,
  fps: 0,
  surface: 'main',
  presenters: {},
  surfaces: [],
  host: {
    phase: 'builtin-default',
    defaultShellVisible: true,
    modLayerVisible: false,
    attached: [],
    viewport: { width: 0, height: 0, devicePixelRatio: 1 },
    recoveryEntry: {
      visible: true,
      open: false,
      canOpenPreferences: true,
      canRestoreDefault: true,
    },
  },
};
const listeners = new Set<() => void>();

export function getDesignModDiagnostics(): DesignModDiagnostics { return latestDiagnostics; }
export function publishDesignModDiagnostics(next: Partial<DesignModDiagnostics>): void {
  latestDiagnostics = { ...latestDiagnostics, ...next };
  listeners.forEach(listener => listener());
}
export function subscribeDesignModDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
