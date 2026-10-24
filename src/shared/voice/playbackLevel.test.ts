import { afterEach, describe, expect, it, vi } from 'vitest';
import { monitorPlaybackLevel } from './playbackLevel';

afterEach(() => vi.unstubAllGlobals());

function fixture(resume = async () => {}) {
  const audio = Object.assign(new EventTarget(), { paused: false });
  const analyser = { fftSize: 0, connect: vi.fn(), disconnect: vi.fn(),
    getFloatTimeDomainData: (data: Float32Array) => data.fill(0.2) };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = { state: 'suspended', resume: vi.fn(resume), createAnalyser: vi.fn(() => analyser),
    createMediaElementSource: vi.fn(() => source), destination: {}, close: vi.fn(async () => {}) };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const report = vi.fn();
  const dispose = monitorPlaybackLevel(audio as unknown as HTMLMediaElement, report);
  return { audio, context, source, report, dispose };
}

describe('output playback analysis lifecycle', () => {
  it('starts on actual playback, samples RMS, and reuses the graph for replay', async () => {
    const f = fixture();
    expect(f.context.createMediaElementSource).not.toHaveBeenCalled();
    f.audio.dispatchEvent(new Event('playing'));
    await vi.waitFor(() => expect(f.report).toHaveBeenLastCalledWith(expect.closeTo(0.6)));
    f.audio.dispatchEvent(new Event('pause'));
    expect(f.report).toHaveBeenLastCalledWith(null);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    f.audio.dispatchEvent(new Event('playing'));
    await vi.waitFor(() => expect(f.report).toHaveBeenLastCalledWith(expect.closeTo(0.6)));
    expect(f.context.createMediaElementSource).toHaveBeenCalledTimes(1);
    f.dispose();
    expect(f.context.close).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending context resume before unmount and never builds a stale graph', async () => {
    let resume!: () => void;
    const f = fixture(() => new Promise<void>(resolve => { resume = resolve; }));
    f.audio.dispatchEvent(new Event('playing'));
    f.dispose();
    resume();
    await Promise.resolve();
    expect(f.context.createMediaElementSource).not.toHaveBeenCalled();
    expect(f.report).toHaveBeenLastCalledWith(null);
  });

  it('reports buffering as silence and releases analysis on errors and end', async () => {
    const f = fixture();
    f.audio.dispatchEvent(new Event('playing'));
    await Promise.resolve();
    f.audio.dispatchEvent(new Event('waiting'));
    expect(f.report).toHaveBeenLastCalledWith(0);
    f.audio.dispatchEvent(new Event('ended'));
    expect(f.report).toHaveBeenLastCalledWith(null);
    f.audio.dispatchEvent(new Event('error'));
    expect(f.report).toHaveBeenLastCalledWith(null);
    f.dispose();
  });

  it('leaves the media element unrerouted when WebAudio cannot resume', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture(async () => { throw new Error('denied'); });
    f.audio.dispatchEvent(new Event('playing'));
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(f.report).toHaveBeenLastCalledWith(null);
    expect(f.context.createMediaElementSource).not.toHaveBeenCalled();
    f.dispose();
    warn.mockRestore();
  });
});
