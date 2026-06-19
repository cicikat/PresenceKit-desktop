import type { Mood, Presence } from '../state/store';

export interface PetSnapshot {
  mood: Mood;
  presence: Presence;
  activityText: string | null;
  thinking: boolean;
  latestAssistantText: string | null;
  updatedAt: number;
}

export interface PetMouseReaction {
  kind: 'shy' | 'nuzzle';
  id: number;
}

export const DEFAULT_PET_SNAPSHOT: PetSnapshot = {
  mood: '平静',
  presence: 'active',
  activityText: null,
  thinking: false,
  latestAssistantText: null,
  updatedAt: 0,
};
