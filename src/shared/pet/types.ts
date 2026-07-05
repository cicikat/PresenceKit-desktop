import type { Mood, Presence } from '../state/store';

export interface PetSnapshot {
  mood: Mood;
  presence: Presence;
  thinking: boolean;
  updatedAt: number;
}

export interface PetMouseReaction {
  kind: 'shy' | 'nuzzle';
  id: number;
}

export const DEFAULT_PET_SNAPSHOT: PetSnapshot = {
  mood: '平静',
  presence: 'active',
  thinking: false,
  updatedAt: 0,
};
