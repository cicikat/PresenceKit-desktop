import { listUserFonts, userFontFamily, userFontUrl } from './fontAppearance';
import { getUIPref, setUIPref } from './uiPreferences';
import { DEFAULT_MOOD_REACTIVE, type MoodReactivePrefs } from './theme/moodReactive';

export interface ChatFontOption {
  fileName: string;
  label: string;
  url: string;
}

export type BackgroundKind = 'none' | 'image' | 'particles' | 'video';
export type { MoodReactivePrefs };

export interface ChatAppearance {
  chatFontSize: number;
  themeFontSize: number;
  fontFile: string | null;
  backgroundBlur: number;
  motionScale: number;
  backgroundKind: BackgroundKind;
  backgroundVideoPath: string | null;
  moodReactive: MoodReactivePrefs;
}

const LEGACY_BUBBLE_FONT_SIZE: Record<string, number> = {
  small: 13,
  medium: 14,
  large: 16,
};

function defaultMotionScale(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  } catch {
    return 1;
  }
}

const DEFAULT_APPEARANCE: ChatAppearance = {
  chatFontSize: 14,
  themeFontSize: 14,
  fontFile: null,
  backgroundBlur: 18,
  motionScale: defaultMotionScale(),
  backgroundKind: 'none',
  backgroundVideoPath: null,
  moodReactive: DEFAULT_MOOD_REACTIVE,
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
    motionScale: clamp(saved.motionScale, DEFAULT_APPEARANCE.motionScale, 0, 1.5),
    backgroundKind: (['none', 'image', 'particles', 'video'] as const).includes(saved.backgroundKind as BackgroundKind)
      ? (saved.backgroundKind as BackgroundKind)
      : DEFAULT_APPEARANCE.backgroundKind,
    backgroundVideoPath: typeof saved.backgroundVideoPath === 'string' ? saved.backgroundVideoPath : null,
    moodReactive: {
      enabled: typeof saved.moodReactive?.enabled === 'boolean' ? saved.moodReactive.enabled : DEFAULT_MOOD_REACTIVE.enabled,
      intensity: clamp(saved.moodReactive?.intensity, DEFAULT_MOOD_REACTIVE.intensity, 0, 1),
    },
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
