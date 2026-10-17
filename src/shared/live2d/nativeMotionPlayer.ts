import type { NativeAction } from './modelProfile';

export interface MotionPort {
  play: (file: string, isCurrent: () => boolean, loop: boolean) => Promise<boolean>;
  stop: () => void;
  changed?: () => void;
}

/** One native lane. New actions interrupt; release plays the authored exit, then returns to idle.
 * Preload and isCurrent guard prevent old asynchronous loads from starting after cancellation.
 */
export class NativeMotionPlayer {
  currentFile: string | null = null;
  failed = false;
  private action: NativeAction | null = null;
  private key: string | null = null;
  private phase: 'enter' | 'loop' | 'exit' = 'enter';
  private until = Infinity;
  private generation = 0;
  private loading = false;
  private disposed = false;

  constructor(private port: MotionPort) {}

  request(action: NativeAction | null, key: string | null, until = Infinity): void {
    if (this.disposed || key === this.key) return;
    this.key = key;
    this.failed = false;
    this.until = until;
    if (!action) {
      if (this.phase !== 'exit') this.release();
      return;
    }
    this.port.stop();
    this.action = action;
    this.play(action.enter ? 'enter' : 'loop');
  }

  tick(now: number): void {
    if (now >= this.until && this.action && this.phase !== 'exit') {
      this.until = Infinity;
      this.release();
    }
  }

  finish(): void {
    if (this.disposed || this.loading || !this.currentFile) return;
    if (this.phase === 'enter' && this.action?.loop) this.play('loop');
    else if (this.phase === 'loop' && this.action?.loop) this.play('loop');
    else this.clear();
  }

  stop(): void {
    if (this.disposed) return;
    this.key = null;
    this.port.stop();
    this.clear();
  }

  dispose(): void { this.stop(); this.disposed = true; }

  private release(): void {
    if (this.action?.exit && this.currentFile) {
      this.port.stop();
      this.play('exit');
    } else {
      this.port.stop();
      this.clear();
    }
  }

  private clear(): void {
    this.generation++;
    this.action = null;
    this.currentFile = null;
    this.loading = false;
    this.port.changed?.();
  }

  private play(phase: 'enter' | 'loop' | 'exit'): void {
    const file = this.action?.[phase];
    if (!file) { this.clear(); return; }
    this.phase = phase;
    this.currentFile = file;
    this.loading = true;
    const generation = ++this.generation;
    const isCurrent = () => !this.disposed && generation === this.generation;
    this.port.changed?.();
    this.port.play(file, isCurrent, phase === 'loop').then(started => {
      if (!isCurrent()) return;
      this.loading = false;
      if (!started) { this.failed = true; this.clear(); }
      else this.port.changed?.();
    }).catch(error => {
      if (!isCurrent()) return;
      console.warn('[live2d] native motion failed', file, error);
      this.failed = true;
      this.clear();
    });
  }
}
