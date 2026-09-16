import { effectiveParts, turnFromChannelMessage } from '../room/turnIngest';
import type { ChatArtifactPayload, StickerPayload } from '../../shared/api/types';

export interface PetDialogue {
  id: string;
  text: string;
  sticker?: StickerPayload;
  artifacts?: ChatArtifactPayload[];
  autoPlayTts?: boolean;
}

/** Use the call window's newline segmentation and display normalization. */
export function splitPetDialogue(message: PetDialogue): PetDialogue[] {
  const { parts } = effectiveParts(turnFromChannelMessage(message.id, message.text, 0));
  if (!parts.length && (message.sticker || message.artifacts?.length)) parts.push('');
  return parts.map((text, index) => ({
    ...message, id: `${message.id}:${index}`, text,
    sticker: index === 0 ? message.sticker : undefined,
    artifacts: index === 0 ? message.artifacts : undefined,
  }));
}
