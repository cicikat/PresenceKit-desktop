import { describe, expect, it, vi } from 'vitest';
import { NativeMotionPlayer } from './nativeMotionPlayer';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('native motion lane', () => {
  it('enters, holds, exits on TTL, and does not replay an unchanged directive', async () => {
    const play = vi.fn(async () => true);
    const player = new NativeMotionPlayer({ play, stop: vi.fn() });
    const action = { enter: 'on', loop: 'loop', exit: 'off' };
    player.request(action, 'directive-1', 500);
    await flush();
    player.finish();
    await flush();
    expect(player.currentFile).toBe('loop');
    player.tick(500);
    await flush();
    expect(player.currentFile).toBe('off');
    player.finish();
    expect(player.currentFile).toBeNull();
    player.request(action, 'directive-1', 500);
    expect(play.mock.calls).toHaveLength(3);
  });
  it('invalidates async loading on replacement, stop and disposal', async () => {
    const guards: (() => boolean)[] = [];
    const completions: ((value: boolean) => void)[] = [];
    const player = new NativeMotionPlayer({ stop: vi.fn(), play: (_file, current) => {
      guards.push(current);
      return new Promise(resolve => completions.push(resolve));
    } });
    player.request({ enter: 'old' }, 'old');
    player.request({ enter: 'new' }, 'new');
    expect(guards[0]()).toBe(false);
    completions[0](true);
    await flush();
    expect(player.currentFile).toBe('new');
    player.dispose();
    expect(guards[1]()).toBe(false);
    completions[1](true);
    await flush();
    expect(player.currentFile).toBeNull();
  });
  it('fails open when playback is rejected and keeps finish events during loading harmless', async () => {
    const player = new NativeMotionPlayer({ stop: vi.fn(), play: async () => false });
    player.request({ enter: 'missing' }, 'x');
    player.finish();
    expect(player.currentFile).toBe('missing');
    await flush();
    expect(player.currentFile).toBeNull();
  });
  it('releases a continuous action immediately when its directive clears', async () => {
    const play = vi.fn(async () => true);
    const player = new NativeMotionPlayer({ play, stop: vi.fn() });
    player.request({ loop: 'loop', exit: 'off' }, 'hold');
    await flush();
    player.request(null, null);
    expect(player.currentFile).toBe('off');
  });
});
