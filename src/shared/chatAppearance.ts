import { listUserFonts, userFontFamily, userFontUrl } from './fontAppearance';
import { getUIPref, setUIPref } from './uiPreferences';

export interface ChatFontOption {
  fileName: string;
  label: string;
  url: string;
}

export interface ChatAppearance {
  chatFontSize: number;
  themeFontSize: number;
  fontFile: string | null;
  backgroundBlur: number;
}

const LEGACY_BUBBLE_FONT_SIZE: Record<string, number> = {
  small: 13,
  medium: 14,
  large: 16,
};

const DEFAULT_APPEARANCE: ChatAppearance = {
  chatFontSize: 14,
  themeFontSize: 14,
  fontFile: null,
  backgroundBlur: 18,
};

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function loadChatAppearance(): ChatAppearance {
  const legacySize = getUIPref('chat.bubbleFontSize', 'medium');
  const saved = getUIPref<Partial<ChatAppearance>>('chat.appearance', {});
  return {
    chatFontSize: clamp(saved.chatFontSize, LEGACY_BUBBLE_FONT_SIZE[legacySize] ?? DEFAULT_APPEARANCE.chatFontSize, 11, 24),
    themeFontSize: clamp(saved.themeFontSize, DEFAULT_APPEARANCE.themeFontSize, 11, 22),
    fontFile: typeof saved.fontFile === 'string' ? saved.fontFile : null,
    backgroundBlur: clamp(saved.backgroundBlur, DEFAULT_APPEARANCE.backgroundBlur, 0, 36),
  };
}

export function saveChatAppearance(appearance: ChatAppearance): void {
  setUIPref('chat.appearance', appearance);
}

export async function listChatFonts(): Promise<ChatFontOption[]> {
  return listUserFonts<ChatFontOption>();
}

export function chatFontFamily(fileName: string | null): string | null {
  return userFontFamily('ChatUserFont', fileName);
}

export function chatFontUrl(fileName: string): string {
  return userFontUrl(fileName);
}

export function chatThemeFontSize(size: number): string {
  return `calc(${size}px * var(--chat-theme-font-scale, 1))`;
}
