import { useEffect, useState } from 'react';

interface DreamAfterglowBannerProps {
  visible: boolean;
  onClose: () => void;
  seconds?: number;
}

export function DreamAfterglowBanner({ visible, onClose, seconds = 12 }: DreamAfterglowBannerProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!visible) return;
    setRemaining(seconds);
    const interval = window.setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    const timeout = window.setTimeout(onClose, seconds * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [visible, seconds, onClose]);

  if (!visible) return null;

  return (
    <button type="button" className="dream-afterglow" onClick={onClose}>
      <span className="dream-afterglow__dot" />
      <span>你刚醒来 · 余温还没散</span>
      <span className="dream-afterglow__count">{remaining}s</span>
    </button>
  );
}
