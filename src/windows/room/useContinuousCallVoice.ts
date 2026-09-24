import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../../shared/api/backend';
import { t } from '../../shared/i18n';

const SEGMENT_MS = 6_000;
const MAX_PENDING_SEGMENTS = 3;

async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useContinuousCallVoice(onTranscript: (text: string, audioPerceptionId?: string) => void) {
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Blob[]>([]);
  const processingRef = useRef(false);
  const generationRef = useRef(0);
  const discardRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processPending = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setTranscribing(true);
    try {
      while (pendingRef.current.length) {
        const blob = pendingRef.current.shift()!;
        if (!blob.size) continue;
        try {
          const result = await transcribeAudio(await toBase64(blob));
          if (!discardRef.current && result.text.trim()) callbackRef.current(result.text.trim(), result.audio_perception_id);
        } catch (cause) {
          setError(`${t('room.call.voice.transcribeFailed')}: ${String(cause).slice(0, 160)}`);
        }
      }
    } finally {
      processingRef.current = false;
      setTranscribing(false);
    }
  }, []);

  const recordSegment = useCallback((stream: MediaStream, generation: number) => {
    if (!stream.active || generation !== generationRef.current) return;
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (discardRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size) {
        if (pendingRef.current.length >= MAX_PENDING_SEGMENTS) {
          pendingRef.current.shift();
          setError(t('room.call.voice.lagging'));
        }
        pendingRef.current.push(blob);
        void processPending();
      }
      if (generation === generationRef.current && stream.active) recordSegment(stream, generation);
    };
    recorder.start();
    timerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
  }, [processPending]);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    discardRef.current = false;
    setError(null);
    const generation = ++generationRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      } });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      stream.getAudioTracks()[0]?.addEventListener('ended', () => stop(true), { once: true });
      setRecording(true);
      recordSegment(stream, generation);
    } catch (cause) {
      setError(`${t('room.call.voice.micFailed')}: ${String(cause).slice(0, 120)}`);
    }
  }, [recordSegment]);

  const stop = useCallback((discard = false) => {
    if (discard) {
      discardRef.current = true;
      pendingRef.current = [];
    }
    generationRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => stop(true), [stop]);
  return { recording, transcribing, error, start, stop };
}
