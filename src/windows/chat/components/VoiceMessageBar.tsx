import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synthesizeDesktopVoice } from '../../../shared/api/runtimeSettings';
import { audioPlaybackQueue, type PlaybackQueueHandle } from '../../../shared/voice/playbackQueue';

function audioUrl(audioB64: string, mime: string): string {
  const binary = atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/wav' }));
}

export function VoiceMessageBar({ text, emotion = 'neutral', fontSize, autoPlay = false, scene = 'desktop_pet' }: { text: string; emotion?: string; fontSize?: number; autoPlay?: boolean; scene?: 'chat' | 'dream' | 'video_call' | 'desktop_pet' }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const mountedRef = useRef(true);
  const preparingRef = useRef<Promise<string> | null>(null);
  const queuedPlaybackRef = useRef<PlaybackQueueHandle | null>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [queued, setQueued] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durationHint = useMemo(() => Math.max(2, Math.min(60, Math.round(text.length / 4.5))), [text]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { autoPlayAttemptedRef.current = false; }, [text]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queuedPlaybackRef.current?.cancel();
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const initAudioAnalysis = () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioContextRef.current;
        if (!sourceRef.current) {
          sourceRef.current = ctx.createMediaElementSource(audio);
        }
        if (!analyserRef.current) {
          analyserRef.current = ctx.createAnalyser();
          analyserRef.current.fftSize = 256;
          dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(ctx.destination);
        }
      } catch (e) {
        console.warn('[voice] audio analysis init failed:', e);
      }
    };

    const updateVolume = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      const data = dataArrayRef.current;
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const normalized = Math.min(1, avg / 255);
      window.dispatchEvent(new CustomEvent('voice-volume', { detail: { volume: normalized } }));
      rafRef.current = requestAnimationFrame(updateVolume);
    };

    audio.addEventListener('play', initAudioAnalysis);

    const onPlayStart = () => {
      rafRef.current = requestAnimationFrame(updateVolume);
    };

    const onPlayEnd = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.dispatchEvent(new CustomEvent('voice-volume', { detail: { volume: 0 } }));
    };

    audio.addEventListener('play', onPlayStart);
    audio.addEventListener('pause', onPlayEnd);
    audio.addEventListener('ended', onPlayEnd);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.removeEventListener('play', initAudioAnalysis);
      audio.removeEventListener('play', onPlayStart);
      audio.removeEventListener('pause', onPlayEnd);
      audio.removeEventListener('ended', onPlayEnd);
    };
  }, []);

  const prepareAudio = useCallback((): Promise<string> => {
    if (url) return Promise.resolve(url);
    if (preparingRef.current) return preparingRef.current;
    setError(null);
    const preparation = (async () => {
      setLoading(true);
      try {
        const result = await synthesizeDesktopVoice(text, emotion, scene);
        const nextUrl = audioUrl(result.audio_b64, result.mime);
        if (!mountedRef.current) {
          URL.revokeObjectURL(nextUrl);
          throw new Error('voice bar unmounted');
        }
        setUrl(nextUrl);
        return nextUrl;
      } catch (e) {
        if (mountedRef.current) setError(String(e));
        throw e;
      } finally {
        if (mountedRef.current) setLoading(false);
        preparingRef.current = null;
      }
    })();
    preparingRef.current = preparation;
    return preparation;
  }, [emotion, scene, text, url]);

  const playPreparedAudio = useCallback((nextUrl: string): Promise<void> => new Promise(resolve => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('pause', finish);
      audio.removeEventListener('error', finish);
      if (mountedRef.current) setPlaying(false);
      resolve();
    };
    audio.src = nextUrl;
    audio.addEventListener('ended', finish);
    audio.addEventListener('pause', finish);
    audio.addEventListener('error', finish);
    void audio.play().then(() => {
      if (!settled && mountedRef.current) setPlaying(true);
    }).catch(e => {
      if (mountedRef.current) setError(String(e));
      finish();
    });
  }), []);

  const play = useCallback(() => {
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    if (queuedPlaybackRef.current) return;
    setQueued(true);
    const handle = audioPlaybackQueue.enqueue(prepareAudio(), playPreparedAudio);
    queuedPlaybackRef.current = handle;
    void handle.done.finally(() => {
      if (queuedPlaybackRef.current !== handle) return;
      queuedPlaybackRef.current = null;
      if (mountedRef.current) setQueued(false);
    });
  }, [playing, playPreparedAudio, prepareAudio]);

  useEffect(() => {
    if (!autoPlay || autoPlayAttemptedRef.current) return;
    autoPlayAttemptedRef.current = true;
    play();
  }, [autoPlay, play]);

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={play} disabled={loading || (queued && !playing)} aria-label={playing ? '暂停语音' : '播放语音'} style={{
          minWidth: 132, height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 9,
          background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: '4px 14px 14px 4px',
          color: 'var(--ink-2)', cursor: loading || (queued && !playing) ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 14 }}>{loading || (queued && !playing) ? '…' : playing ? 'Ⅱ' : '▶'}</span>
          <span style={{ display: 'flex', gap: 2, alignItems: 'center', height: 16 }}>
            {[7, 12, 16, 10, 14, 8].map((height, index) => <i key={index} style={{ width: 2, height, borderRadius: 2, background: 'var(--accent-3)', opacity: playing ? 1 : .55 }} />)}
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{durationHint}″</span>
        </button>
        <button onClick={() => setShowText(value => !value)} style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5 }}>
          {showText ? '收起文字' : '转文字'}
        </button>
      </div>
      {showText && <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--paper)', border: '1px solid var(--paper-edge)', fontSize: fontSize ?? 12.5, lineHeight: 1.65 }}>{text}</div>}
      {error && <div className="mono" style={{ fontSize: 9.5, color: 'var(--danger)' }}>语音生成失败：{error}</div>}
    </div>
  );
}
