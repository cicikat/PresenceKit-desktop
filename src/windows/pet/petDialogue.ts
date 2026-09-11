import { effectiveParts, turnFromChannelMessage } from '../room/turnIngest';
import type { StickerPayload } from '../../shared/api/types';

export interface PetDialogue {
  id: string;
  text: string;
  sticker?: StickerPayload;
  autoPlayTts?: boolean;
}

/** Use the call window's newline segmentation and display normalization. */
export function splitPetDialogue(message: PetDialogue): PetDialogue[] {
  const { parts } = effectiveParts(turnFromChannelMessage(message.id, message.text, 0));
  if (!parts.length && message.sticker) parts.push('');
  return parts.map((text, index) => ({
    ...message, id: `${message.id}:${index}`, text,
    sticker: index === 0 ? message.sticker : undefined,
  }));
}
