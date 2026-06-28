import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeAudio } from '../api/backend';

export interface VoiceInputHandle {
  isRecording: boolean;
  transcribing: boolean;
  volume: number;    // 0..1 RMS, updated via rAF during recording
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useVoiceInput(): VoiceInputHandle {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Use refs so start/stop callbacks are stable and always see fresh state
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);

  const stopVolumeLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setVolume(0);
  }, []);

  const start = useCallback(async () => {
    if (isRecordingRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Volume monitoring via AudioContext + AnalyserNode
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const f = (v / 128) - 1; sum += f * f; }
        setVolume(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);

      // MediaRecorder
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);

      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      setError('无法访问麦克风');
    }
  }, []);

  const stop = useCallback(async (): Promise<string | null> => {
    if (!isRecordingRef.current) return null;
    isRecordingRef.current = false;
    setIsRecording(false);
    stopVolumeLoop();

    const mr = mediaRecorderRef.current;
    if (!mr) return null;

    const blob = await new Promise<Blob>(resolve => {
      mr.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }));
      };
      mr.stop();
    });

    streamRef.current?.getTracks().forEach(t => t.stop());
    await audioCtxRef.current?.close().catch(() => {});
    streamRef.current = null;
    audioCtxRef.current = null;
    mediaRecorderRef.current = null;

    if (blob.size === 0) return null;

    setTranscribing(true);
    try {
      const b64 = await blobToBase64(blob);
      const result = await transcribeAudio(b64);
      return result.text;
    } catch {
      setError('转写失败');
      return null;
    } finally {
      setTranscribing(false);
    }
  }, [stopVolumeLoop]);

  useEffect(() => {
    return () => {
      stopVolumeLoop();
      if (isRecordingRef.current) {
        mediaRecorderRef.current?.stop();
        streamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close().catch(() => {});
      }
    };
  }, [stopVolumeLoop]);

  return { isRecording, transcribing, volume, error, start, stop };
}
