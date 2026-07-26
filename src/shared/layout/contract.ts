export const SLOT_IDS = ['ribbon', 'sidebar', 'main'] as const;

export type SlotId = typeof SLOT_IDS[number];
