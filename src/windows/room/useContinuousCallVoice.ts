import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '../../shared/api/backend';
import { t } from '../../shared/i18n';

const MAX_SEGMENT_MS = 12_000;
const END_SILENCE_MS = 900;
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
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
          if (!discardRef.current && result.text.trim()) {
            setError(null);
            callbackRef.current(result.text.trim(), result.audio_perception_id);
          }
        } catch (cause) {
          if (String(cause).includes('NO_SPEECH')) continue;
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
    const analyser = analyserRef.current;
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    let voicedFrames = 0;
    let lastVoiceAt = Date.now();
    const startedAt = Date.now();
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (discardRef.current) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (blob.size && (!analyser || voicedFrames >= 3)) {
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
    timerRef.current = setInterval(() => {
      if (analyser && samples) {
        analyser.getByteTimeDomainData(samples);
        let power = 0;
        for (const sample of samples) power += ((sample - 128) / 128) ** 2;
        if (Math.sqrt(power / samples.length) > 0.008) {
          voicedFrames += 1;
          lastVoiceAt = Date.now();
        }
      }
      const elapsed = Date.now() - startedAt;
      if ((voicedFrames >= 3 && elapsed >= 1_200 && Date.now() - lastVoiceAt >= END_SILENCE_MS)
          || elapsed >= MAX_SEGMENT_MS) {
        if (recorder.state === 'recording') recorder.stop();
      }
    }, 100);
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
      try {
        const context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioContextRef.current = context;
        analyserRef.current = analyser;
      } catch { /* STT still runs if the Web Audio meter is unavailable. */ }
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
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) void context.close();
    setRecording(false);
  }, []);

  useEffect(() => () => stop(true), [stop]);
  return { recording, transcribing, error, start, stop };
}
