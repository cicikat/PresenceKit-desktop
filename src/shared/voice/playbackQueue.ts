export interface PlaybackQueueHandle {
  cancel(): void;
  readonly done: Promise<void>;
}

export interface AudioPlaybackPermit {
  release(): Promise<void>;
}

export interface AudioPlaybackGate {
  acquire(): Promise<AudioPlaybackPermit>;
}

interface PlaybackQueueItem {
  ready: Promise<string>;
  play(url: string): Promise<void>;
  cancelled: boolean;
  finish(): void;
}

let playbackGate: AudioPlaybackGate | null = null;

export function setAudioPlaybackGate(gate: AudioPlaybackGate | null): void {
  playbackGate = gate;
}

/**
 * A renderer-wide FIFO for audio output.  Preparation begins before an item is
 * enqueued, so slow synthesis never blocks later bubbles from rendering; only
 * the audible part is serialized.
 */
export class AudioPlaybackQueue {
  private readonly items: PlaybackQueueItem[] = [];
  private running = false;

  enqueue(ready: Promise<string>, play: (url: string) => Promise<void>): PlaybackQueueHandle {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    const item: PlaybackQueueItem = { ready, play, cancelled: false, finish };
    this.items.push(item);
    void this.pump();

    return {
      done,
      cancel: () => { item.cancelled = true; },
    };
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.items.length > 0) {
      const item = this.items.shift()!;
      let permit: AudioPlaybackPermit | null = null;
      try {
        const url = await item.ready;
        if (!item.cancelled) {
          permit = playbackGate ? await playbackGate.acquire() : null;
          if (!item.cancelled) await item.play(url);
        }
      } catch {
        // The owning voice bar exposes synthesis/playback errors in its UI.
      } finally {
        if (permit) {
          try { await permit.release(); }
          catch (error) { console.warn('[voice] playback lease release failed:', error); }
        }
        item.finish();
      }
    }
    this.running = false;
  }
}

export const audioPlaybackQueue = new AudioPlaybackQueue();
