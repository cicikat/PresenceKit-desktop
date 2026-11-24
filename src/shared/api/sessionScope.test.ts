import { describe, expect, it, vi } from 'vitest';
import { RealitySessions, type RealityGrant } from './sessionScope';

const grant = (char = 'first', connection = 'connection'): RealityGrant => ({
  session_id: `session-${char}`, char_id: char, owner_id: 'owner', domain: 'reality',
  expires_at: Date.now() / 1000 + 3600, connection_key: connection,
});

describe('Reality session lifecycle', () => {
  it('coalesces binding, retains identity and rejects expiry without rebinding', async () => {
    const sessions = new RealitySessions();
    const value = grant();
    const bind = vi.fn(async () => value);
    expect(await Promise.all([sessions.acquire('first', 'connection', bind), sessions.acquire('first', 'connection', bind)]))
      .toEqual([value, value]);
    expect(bind).toHaveBeenCalledTimes(1);
    await expect(sessions.acquire('first', 'connection', bind, value.expires_at + 1)).rejects.toThrow('session_not_found');
    expect(bind).toHaveBeenCalledTimes(1);
  });

  it('binds a new role or connection and rejects a late previous-role grant', async () => {
    const sessions = new RealitySessions();
    let finish!: (value: RealityGrant) => void;
    const old = sessions.acquire('first', 'connection', () => new Promise(resolve => { finish = resolve; }));
    expect((await sessions.acquire('second', 'connection', async () => grant('second'))).char_id).toBe('second');
    finish(grant());
    await expect(old).rejects.toThrow('session_scope_stale');
    expect((await sessions.acquire('second', 'other', async () => grant('second', 'other'))).connection_key).toBe('other');
  });

  it('does not silently replace a failed or mismatched session', async () => {
    const sessions = new RealitySessions();
    const bind = vi.fn(async () => { throw new Error('HTTP 403'); });
    await expect(sessions.acquire('first', 'connection', bind)).rejects.toThrow('HTTP 403');
    await expect(sessions.acquire('first', 'connection', bind)).rejects.toThrow('HTTP 403');
    expect(bind).toHaveBeenCalledTimes(1);
    await expect(sessions.acquire('other', 'connection', async () => grant())).rejects.toThrow('session_scope_stale');
  });
});
