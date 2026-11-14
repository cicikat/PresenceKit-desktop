import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../../shared/activeCharacter';
import { openAmbientSession, publishAmbient } from '../../shared/api/backend';

export function useAmbientSound() {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const closeRef = useRef<() => void>(() => {});
  const stop = useCallback(() => {
    closeRef.current();
    setEnabled(false);
  }, []);

  useEffect(() => {
    if (!enabled || !document.hasFocus() || document.hidden) return;
    const character = getActiveCharacterInfo().id;
    if (!character) return;
    let closed = false;
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let session: string | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let baseline: number | undefined;
    let busy = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (context) void context.close().catch(() => {});
      setAvailable(false);
      if (session) void publishAmbient(session, {
        sound: { status: 'unavailable', observed_at: Date.now() / 1000 + 0.001 },
      }).catch(() => {});
    };
    closeRef.current = close;
    window.addEventListener('blur', stop);
    const unsubscribe = subscribeActiveCharacter(() => {
      if (getActiveCharacterInfo().id !== character) stop();
    });

    const start = async () => {
      try {
        session = await openAmbientSession(character);
        if (closed) return;
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false },
        });
        if (closed) {
          acquired.getTracks().forEach(track => track.stop());
          return;
        }
        stream = acquired;
        const track = stream.getAudioTracks()[0];
        track.addEventListener('ended', stop, { once: true });
        track.addEventListener('mute', stop, { once: true });
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        context.createMediaStreamSource(stream).connect(analyser);
        await context.resume();
        if (closed) return;
        const samples = new Float32Array(analyser.fftSize);
        const sample = async () => {
          if (closed || busy || document.hidden || track.muted || !track.enabled) return;
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
          const sudden = baseline !== undefined && rms >= 0.04 && rms > baseline * 4;
          baseline = baseline === undefined ? rms : baseline * 0.85 + rms * 0.15;
          samples.fill(0);
          if (!session) return;
          busy = true;
          try {
            await publishAmbient(session, { sound: {
              status: rms === 0 ? 'unavailable' : 'available',
              ...(rms > 0 ? {
                level: rms < 0.01 ? 'quiet' : rms < 0.05 ? 'normal' : 'loud',
                sudden_sound: sudden, confidence: 0.5,
              } : {}),
              observed_at: Date.now() / 1000,
            } });
            if (!closed) setAvailable(rms > 0);
          } catch {
            stop();
          } finally {
            busy = false;
          }
        };
        void sample();
        timer = setInterval(() => void sample(), 30_000);
      } catch {
        if (!closed) stop();
      }
    };
    void start();
    return () => {
      window.removeEventListener('blur', stop);
      unsubscribe();
      close();
    };
  }, [enabled, stop]);

  return { enabled, available, setEnabled, stop };
}
