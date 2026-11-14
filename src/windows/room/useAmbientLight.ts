import { useEffect, useState, type RefObject } from 'react';
import { getActiveCharacterInfo } from '../../shared/activeCharacter';
import { openAmbientSession, publishAmbient } from '../../shared/api/backend';

export function useAmbientLight(videoRef: RefObject<HTMLVideoElement | null>, cameraOn: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!cameraOn) setEnabled(false);
    if (!enabled || !cameraOn) return;
    const character = getActiveCharacterInfo().id;
    if (!character) return;
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 45;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    let session: string | undefined;
    let stopped = false;
    let busy = false;
    let baseline: number | undefined;
    let previous: number | undefined;

    const sample = async () => {
      const video = videoRef.current;
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      if (busy || document.hidden || !video || video.readyState < 2 || !track ||
          track.readyState !== 'live' || track.muted || !track.enabled) return;
      busy = true;
      try {
        if (!session) session = await openAmbientSession(character);
        if (stopped || document.hidden) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const histogram = new Uint16Array(256);
        for (let i = 0; i < pixels.length; i += 4) {
          const luma = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]);
          histogram[luma]++;
        }
        let count = 0;
        let median = 0;
        while (count + histogram[median] < pixels.length / 8) count += histogram[median++];
        const brightness = Math.round(median * 100 / 255);
        const confirmed = previous !== undefined && Math.abs(previous - brightness) <= 8;
        const delta = baseline === undefined ? 0 : brightness - baseline;
        const trend = !confirmed ? 'unknown' : delta >= 18 ? 'brighter' : delta <= -18 ? 'darker' : 'stable';
        if (confirmed) baseline = baseline === undefined || Math.abs(delta) >= 18
          ? brightness : 0.75 * baseline + 0.25 * brightness;
        previous = brightness;
        await publishAmbient(session, { allow_light_candidate: true, light: {
          status: 'available', observed_at: Date.now() / 1000,
          relative_brightness: brightness, trend,
          level: confirmed ? brightness < 20 ? 'dark' : brightness < 40 ? 'dim' : brightness < 70 ? 'moderate' : 'bright' : 'unknown',
          confidence: confirmed ? 0.6 : 0.35,
        } });
        if (!stopped) setAvailable(true);
      } catch {
        session = undefined;
        if (!stopped) setAvailable(false);
      } finally {
        busy = false;
      }
    };

    const hide = () => {
      if (document.hidden) setEnabled(false);
    };
    document.addEventListener('visibilitychange', hide);
    const pause = () => setEnabled(false);
    window.addEventListener('blur', pause);
    void sample();
    const timer = setInterval(() => void sample(), 30_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', pause);
      setAvailable(false);
      if (session) void publishAmbient(session, {
        light: { status: 'unavailable', observed_at: Date.now() / 1000 + 0.001 },
      }).catch(() => {});
    };
  }, [cameraOn, enabled, videoRef]);

  return { enabled, available, setEnabled };
}
