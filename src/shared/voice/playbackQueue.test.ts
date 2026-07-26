import { describe, expect, it } from 'vitest';
import { AudioPlaybackQueue } from './playbackQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AudioPlaybackQueue', () => {
  it('allows audio preparation to finish out of order while preserving playback order', async () => {
    const queue = new AudioPlaybackQueue();
    const firstAudio = deferred<string>();
    const secondAudio = deferred<string>();
    const firstPlayback = deferred<void>();
    const played: string[] = [];

    queue.enqueue(firstAudio.promise, async url => {
      played.push(url);
      await firstPlayback.promise;
    });
    queue.enqueue(secondAudio.promise, async url => { played.push(url); });

    secondAudio.resolve('second');
    await flush();
    expect(played).toEqual([]);

    firstAudio.resolve('first');
    await flush();
    expect(played).toEqual(['first']);

    firstPlayback.resolve();
    await flush();
    expect(played).toEqual(['first', 'second']);
  });

  it('skips a queued item cancelled before its audio is ready', async () => {
    const queue = new AudioPlaybackQueue();
    const audio = deferred<string>();
    const played: string[] = [];
    const handle = queue.enqueue(audio.promise, async url => { played.push(url); });

    handle.cancel();
    audio.resolve('cancelled');
    await handle.done;

    expect(played).toEqual([]);
  });
});
