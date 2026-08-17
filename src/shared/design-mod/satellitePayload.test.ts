import { describe, expect, it } from 'vitest';
import { canReuseSatellitePayload } from './satellitePayload';

describe('satellite payload generations', () => {
  it('does not reuse sequence one across mods or generations', () => {
    const current = { generation: 1, modId: 'mod-a', sequence: 1 };
    expect(canReuseSatellitePayload(current, { generation: 1, modId: 'mod-a', sequence: 1 })).toBe(true);
    expect(canReuseSatellitePayload(current, { generation: 2, modId: 'mod-b', sequence: 1 })).toBe(false);
    expect(canReuseSatellitePayload(current, { generation: 1, modId: 'mod-b', sequence: 1 })).toBe(false);
  });
});
