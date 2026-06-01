import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import { cropImageToBlob } from '../../../shared/images/cropImageToBlob';

export function DreamBackgroundCropper({
  imageSrc,
  onConfirm,
  onCancel,
}: {
  imageSrc: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
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
    const blob = await cropImageToBlob(imageSrc, croppedAreaPixels, 1920, 1080);
    onConfirm(blob);
  };

  return (
    <div className="dream-background-cropper">
      <div className="dream-background-cropper__panel">
        <div className="dream-background-cropper__header">
          <div className="dream-background-cropper__title">裁剪梦境背景</div>
          <div className="dream-background-cropper__kicker">1920 × 1080 · CHAT BACKGROUND</div>
        </div>
        <div className="dream-background-cropper__stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={16 / 9}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="dream-background-cropper__footer">
          <label className="dream-background-cropper__zoom">
            <span>缩放</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
            />
          </label>
          <div className="dream-background-cropper__actions">
            <button type="button" onClick={onCancel}>取消</button>
            <button type="button" className="is-primary" onClick={handleConfirm} disabled={confirming}>
              {confirming ? '处理中…' : '确认导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
