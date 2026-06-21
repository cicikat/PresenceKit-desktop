import type { ReactNode } from 'react';
import { DreamGlowPanel } from '../DreamGlowPanel';

interface HudGroupProps {
  title: string;
  children: ReactNode;
}

export function HudGroup({ title, children }: HudGroupProps) {
  return (
    <DreamGlowPanel title={title} topSheen={false} className="dream-hud__group">
      {children}
    </DreamGlowPanel>
  );
}
