import { useCallback, useEffect, useRef, useState } from 'react';
import { closeVideoCallCamera, getVideoCallState, observeVideoCallFrame, pollVideoCallCamera, submitVideoCallCameraFrame } from '../../shared/api/backend';
import { t } from '../../shared/i18n';

const FRAME_INTERVAL_MS = 4_000;
const OBSERVATION_MAX_AGE_MS = 40_000;

function readCameraFrame(video: HTMLVideoElement | null, stream: MediaStream | null): string | undefined {
  if (!video || video.readyState < 2 || !stream?.active) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 640 / video.videoWidth, 360 / video.videoHeight);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.68).split(',')[1] || undefined;
}

export function useVideoCallCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollBusyRef = useRef(false);
  const closePendingRef = useRef<Promise<void>>(Promise.resolve());
  const busyRef = useRef(false);
  const retryNotBeforeRef = useRef(0);
  const generationRef = useRef(0);
  const latestRef = useRef<{ id: string; receivedAt: number } | null>(null);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState(() => t('room.call.camera.off'));

  const stop = useCallback(() => {
    const wasOpen = streamRef.current !== null;
    generationRef.current += 1;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    latestRef.current = null;
    retryNotBeforeRef.current = 0;
    setOn(false);
    setStatus(t('room.call.camera.off'));
    if (wasOpen) closePendingRef.current = closeVideoCallCamera().catch(() => {});
  }, []);

  const capture = useCallback(async (generation: number) => {
    // Keep at most one analysis in flight. The next tick takes a fresh frame.
    if (busyRef.current || generation !== generationRef.current || Date.now() < retryNotBeforeRef.current) return;
    const frameB64 = readCameraFrame(videoRef.current, streamRef.current);
    if (!frameB64) return;
    busyRef.current = true;
    setStatus(t('room.call.camera.observing'));
    try {
      const result = await observeVideoCallFrame(frameB64);
      if (generation !== generationRef.current) return;
      if (result.status === 'ready' && result.observation_id) {
        latestRef.current = { id: result.observation_id, receivedAt: Date.now() };
        setStatus(t('room.call.camera.ready'));
      } else if (result.status === 'unavailable') {
        retryNotBeforeRef.current = Date.now() + Math.max(1, result.retry_after_seconds || 15) * 1000;
        setStatus(t('room.call.camera.unavailable'));
      } else if (result.status === 'timeout') {
        setStatus(t('room.call.camera.timeout'));
      } else {
        setStatus(t(result.status === 'busy' ? 'room.call.camera.busy' : 'room.call.camera.retry'));
      }
    } catch (error) {
      if (generation === generationRef.current) setStatus(`${t('room.call.camera.failed')}: ${String(error).slice(0, 100)}`);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const pollFreshFrame = useCallback(async (generation: number) => {
    if (pollBusyRef.current || generation !== generationRef.current || !streamRef.current?.active) return;
    pollBusyRef.current = true;
    try {
      const { request } = await pollVideoCallCamera();
      if (!request || generation !== generationRef.current) return;
      const frame = readCameraFrame(videoRef.current, streamRef.current);
      if (generation !== generationRef.current) return;
      await submitVideoCallCameraFrame(request.request_id, frame);
    } catch {
      // The backend request expires; periodic observation remains independent.
    } finally {
      pollBusyRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    const generation = ++generationRef.current;
    await closePendingRef.current;
    if (generation !== generationRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 10, max: 15 } },
        audio: false,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setOn(true);
      let route: { effective: boolean; blocking_reason: string };
      try {
        route = await getVideoCallState();
      } catch (error) {
        if (generation === generationRef.current) setStatus(`${t('room.call.camera.stateFailed')}: ${String(error).slice(0, 80)}`);
        return;
      }
      if (generation !== generationRef.current) return;
      if (!route.effective) {
        setStatus(`${t('room.call.camera.inactive')}: ${route.blocking_reason}`);
        return;
      }
      setStatus(t('room.call.camera.waiting'));
      void capture(generation);
      timerRef.current = setInterval(() => void capture(generation), FRAME_INTERVAL_MS);
      void pollFreshFrame(generation);
      pollTimerRef.current = setInterval(() => void pollFreshFrame(generation), 1_000);
    } catch (error) {
      if (generation === generationRef.current) {
        stop();
        setStatus(`${t('room.call.camera.openFailed')}: ${String(error).slice(0, 100)}`);
      }
    }
  }, [capture, pollFreshFrame, stop]);

  const takeLatestObservation = useCallback(() => {
    const latest = latestRef.current;
    latestRef.current = null;
    return latest && Date.now() - latest.receivedAt < OBSERVATION_MAX_AGE_MS ? latest.id : undefined;
  }, []);

  useEffect(() => () => stop(), [stop]);
  return { videoRef, on, status, start, stop, takeLatestObservation };
}
