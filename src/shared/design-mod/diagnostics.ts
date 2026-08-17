import type { DesignComponentId } from './contract';
import { formatDiagnostic } from './runtime';
import type { DesignModDiagnostic, DesignModManifest, DesignModRecord, DesignSurface } from './types';

export interface DesignModDiagnostics {
  manifest: DesignModManifest | null;
  available: DesignModRecord[];
  diagnostic: DesignModDiagnostic;
  attached: DesignComponentId[];
  activeSubscriptions: number;
  fps: number;
  surface: DesignSurface;
}

let latestDiagnostics: DesignModDiagnostics = {
  manifest: null,
  available: [],
  diagnostic: formatDiagnostic('idle', 'builtin-default'),
  attached: [],
  activeSubscriptions: 0,
  fps: 0,
  surface: 'main',
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
