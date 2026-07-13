import { useEffect, useMemo, useRef, useState } from 'react';
import { synthesizeDesktopVoice } from '../../../shared/api/runtimeSettings';

function audioUrl(audioB64: string, mime: string): string {
  const binary = atob(audioB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/wav' }));
}

export function VoiceMessageBar({ text, emotion = 'neutral' }: { text: string; emotion?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const durationHint = useMemo(() => Math.max(2, Math.min(60, Math.round(text.length / 4.5))), [text]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const play = async () => {
    setError(null);
    let nextUrl = url;
    if (!nextUrl) {
      setLoading(true);
      try {
        const result = await synthesizeDesktopVoice(text, emotion);
        nextUrl = audioUrl(result.audio_b64, result.mime);
        setUrl(nextUrl);
      } catch (e) {
        setError(String(e));
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    if (playing) { audio.pause(); setPlaying(false); return; }
    audio.src = nextUrl;
    audio.onended = () => setPlaying(false);
    try { await audio.play(); setPlaying(true); }
    catch (e) { setError(String(e)); setPlaying(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => void play()} disabled={loading} aria-label={playing ? '暂停语音' : '播放语音'} style={{
          minWidth: 132, height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 9,
          background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: '4px 14px 14px 4px',
          color: 'var(--ink-2)', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 14 }}>{loading ? '…' : playing ? 'Ⅱ' : '▶'}</span>
          <span style={{ display: 'flex', gap: 2, alignItems: 'center', height: 16 }}>
            {[7, 12, 16, 10, 14, 8].map((height, index) => <i key={index} style={{ width: 2, height, borderRadius: 2, background: 'var(--accent-3)', opacity: playing ? 1 : .55 }} />)}
          </span>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{durationHint}″</span>
        </button>
        <button onClick={() => setShowText(value => !value)} style={{ background: 'transparent', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10.5 }}>
          {showText ? '收起文字' : '转文字'}
        </button>
      </div>
      {showText && <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--paper)', border: '1px solid var(--paper-edge)', fontSize: 12.5, lineHeight: 1.6 }}>{text}</div>}
      {error && <div className="mono" style={{ fontSize: 9.5, color: 'var(--danger)' }}>语音生成失败：{error}</div>}
    </div>
  );
}
