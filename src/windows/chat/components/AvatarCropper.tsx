import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { cropImageToBlob } from '../../../shared/images/cropImageToBlob';

export function AvatarCropper({
  imageSrc,
  onConfirm,
  onCancel,
  error,
}: {
  imageSrc: string;
  onConfirm: (blob: Blob) => void | Promise<void>;
  onCancel: () => void;
  error?: string | null;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);

  const onCropComplete = useCallback((_: any, areaPixels: any) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || confirming) return;
    setConfirming(true);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels, 256, 256);
      await onConfirm(blob);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 120,
      background: 'oklch(0.10 0.04 60 / 0.80)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 440, background: 'var(--paper)',
        border: '1px solid var(--paper-edge)',
        borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 30px 80px var(--shadow-rgb-mix)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--paper-edge)',
          background: 'var(--paper-2)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div className="serif" style={{ fontSize: 15, fontWeight: 600 }}>裁剪头像</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.4 }}>256 × 256 · ROUND</div>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 340, background: 'oklch(0.12 0.03 60)' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--paper-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.2 }}>缩放</span>
            <input
              type="range" min={1} max={3} step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
          {error && (
            <div className="mono" style={{ color: 'var(--danger)', fontSize: 9.5, letterSpacing: 0.8 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 12.5,
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
            }}>取消</button>
            <button onClick={handleConfirm} disabled={confirming} style={{
              padding: '8px 20px', borderRadius: 4, fontSize: 12.5,
              background: confirming ? 'var(--paper-3)' : 'var(--ink)',
              border: 'none',
              color: confirming ? 'var(--ink-3)' : 'var(--paper)',
              cursor: confirming ? 'wait' : 'pointer',
              fontFamily: 'inherit', fontWeight: 600,
              transition: 'all 0.15s',
            }}>{confirming ? '处理中…' : '确认'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
