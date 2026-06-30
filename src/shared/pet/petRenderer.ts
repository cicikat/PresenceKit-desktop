import type { FC } from 'react';
import type { PetMouseReaction, PetSnapshot } from './types';

export interface PetRendererProps {
  snapshot: PetSnapshot;
  reaction?: PetMouseReaction | null;
  volume?: number;
}

export type PetRenderer = FC<PetRendererProps>;
