import { useEffect, useRef } from 'react';

export interface PlaybackLevelNotice { volume: number; available: boolean; playbackId: string }

/** Null means unavailable; zero is a measured silence and must keep the mouth closed. */
export function usePlaybackLevel(): () => number | null {
  const latest = useRef<{ id: string; volume: number | null; at: number } | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const notice = (event as CustomEvent<PlaybackLevelNotice>).detail;
      if (!notice || typeof notice.playbackId !== 'string') return;
      if (!notice.available && latest.current?.id !== notice.playbackId) return;
      latest.current = { id: notice.playbackId, volume: notice.available && Number.isFinite(notice.volume)
        ? Math.max(0, Math.min(1, notice.volume)) : null, at: performance.now() };
    };
    window.addEventListener('voice-volume', receive);
    return () => { window.removeEventListener('voice-volume', receive); latest.current = null; };
  }, []);
  return () => latest.current && performance.now() - latest.current.at < 250 ? latest.current.volume : null;
}
