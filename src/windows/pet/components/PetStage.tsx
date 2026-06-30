import { useEffect, useState } from 'react';
import { loadPetVisualStyle, subscribePetVisualStyle, type PetVisualStyle } from '../../../shared/pet/petVisualStyle';
import type { PetRendererProps } from '../../../shared/pet/petRenderer';
import { ParticleCanvas } from './ParticleCanvas';
import { Live2DStage } from './Live2DStage';

const PARTICLE_STYLES = new Set<PetVisualStyle>(['fluid', 'scatter', 'network']);

export function PetStage({ snapshot, reaction, volume }: PetRendererProps) {
  const [style, setStyle] = useState<PetVisualStyle>(() => loadPetVisualStyle());

  useEffect(() => subscribePetVisualStyle(setStyle), []);

  if (PARTICLE_STYLES.has(style)) {
    return <ParticleCanvas snapshot={snapshot} reaction={reaction} volume={volume ?? 0} />;
  }
  if (style === 'live2d') {
    return <Live2DStage snapshot={snapshot} reaction={reaction} volume={volume} />;
  }
  return <ParticleCanvas snapshot={snapshot} reaction={reaction} volume={volume ?? 0} />;
}
