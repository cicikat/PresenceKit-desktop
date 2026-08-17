import { describe, expect, it } from 'vitest';
import { evaluateNativeSurfacePackages, evaluateSurfaceCapabilities, normaliseCapability, type NativeCapabilityReport } from './capabilities';

const windows: NativeCapabilityReport = {
  platform: 'windows',
  status: 'supported',
  capabilities: ['platform', 'transparent-window', 'native-satellite-v1', 'interactive', 'passthrough', 'presenter-snapshot', 'navigation-snapshot'],
};

describe('native surface capability closure', () => {
  it('normalises the v2 fixture aliases', () => {
    expect(normaliseCapability('navigation')).toBe('navigation-snapshot');
    expect(normaliseCapability('presenters')).toBe('presenter-snapshot');
    expect(normaliseCapability('made-up')).toBeNull();
  });

  it('returns visible reasons instead of silently falling back', () => {
    const result = evaluateSurfaceCapabilities({ id: 'island', kind: 'island', pointerMode: 'interactive', requires: ['navigation', 'made-up'] }, windows);
    expect(result.supported).toBe(false);
    expect(result.status).toBe('partial');
    expect(result.reasons.join(';')).toContain('unknown capability: made-up');
  });

  it('marks non-Windows validation as experimental and unavailable platforms explicitly', () => {
    const experimental = evaluateNativeSurfacePackages([{ id: 'halo', kind: 'halo', pointerMode: 'passthrough', requires: [] }], { ...windows, platform: 'linux', status: 'experimental', reason: '真实窗口验收未完成' });
    expect(experimental[0].status).toBe('experimental');
    expect(experimental[0].supported).toBe(true);
    const unavailable = evaluateNativeSurfacePackages([{ id: 'halo', kind: 'halo', pointerMode: 'passthrough', requires: [] }], { ...windows, platform: 'freebsd', status: 'unavailable', capabilities: [], reason: '平台未实现' });
    expect(unavailable[0].status).toBe('unavailable');
    expect(unavailable[0].reasons[0]).toBe('平台未实现');
  });
});
