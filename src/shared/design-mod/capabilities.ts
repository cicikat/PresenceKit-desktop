import type { NativeSurfaceManifest } from './types';

export type NativeCapability =
  | 'platform'
  | 'transparent-window'
  | 'native-satellite-v1'
  | 'interactive'
  | 'passthrough'
  | 'presenter-snapshot'
  | 'navigation-snapshot';

export type CapabilityStatus = 'supported' | 'experimental' | 'unavailable' | 'partial';

export interface NativeCapabilityReport {
  platform: string;
  status: CapabilityStatus;
  capabilities: readonly NativeCapability[];
  reason?: string;
}

export interface SurfaceCapabilityResult {
  surfaceId: string;
  status: CapabilityStatus;
  supported: boolean;
  reasons: string[];
}

export function normaliseCapability(value: string): NativeCapability | null {
  const aliases: Record<string, NativeCapability> = {
    navigation: 'navigation-snapshot',
    presenters: 'presenter-snapshot',
    'navigation-snapshot': 'navigation-snapshot',
    'presenter-snapshot': 'presenter-snapshot',
    platform: 'platform',
    'transparent-window': 'transparent-window',
    'native-satellite-v1': 'native-satellite-v1',
    interactive: 'interactive',
    passthrough: 'passthrough',
  };
  return aliases[value] ?? null;
}

export function evaluateSurfaceCapabilities(
  surface: Pick<NativeSurfaceManifest, 'id' | 'kind' | 'pointerMode' | 'requires'>,
  report: NativeCapabilityReport,
): SurfaceCapabilityResult {
  const reasons: string[] = [];
  const required = new Set<NativeCapability>(['platform', 'transparent-window', 'native-satellite-v1', ...(surface.requires ?? []).map(normaliseCapability).filter((value): value is NativeCapability => value !== null)]);
  for (const requested of surface.requires ?? []) {
    if (!normaliseCapability(requested)) reasons.push(`unknown capability: ${requested}`);
  }
  if (surface.kind === 'halo') required.add('passthrough');
  if (surface.pointerMode === 'interactive') required.add('interactive');
  if (surface.pointerMode === 'passthrough') required.add('passthrough');
  for (const capability of required) {
    if (!report.capabilities.includes(capability)) reasons.push(`missing capability: ${capability}`);
  }
  if (report.status === 'unavailable') reasons.unshift(report.reason ?? `platform unavailable: ${report.platform}`);
  if (reasons.length > 0) return { surfaceId: surface.id, status: report.status === 'unavailable' ? 'unavailable' : 'partial', supported: false, reasons };
  return { surfaceId: surface.id, status: report.status, supported: true, reasons: report.reason ? [report.reason] : [] };
}

export function evaluateNativeSurfacePackages(packages: readonly Pick<NativeSurfaceManifest, 'id' | 'kind' | 'pointerMode' | 'requires'>[], report: NativeCapabilityReport): SurfaceCapabilityResult[] {
  return packages.map(surface => evaluateSurfaceCapabilities(surface, report));
}
