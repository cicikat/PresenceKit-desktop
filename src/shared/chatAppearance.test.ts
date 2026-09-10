import { describe, expect, it, vi } from 'vitest';
const { saved } = vi.hoisted(() => ({ saved: { value: {} as Record<string, unknown> } }));
vi.mock('./uiPreferences', () => ({ getUIPref: (key: string, fallback: unknown) => key === 'chat.appearance' ? saved.value : fallback, setUIPref: vi.fn() }));
import { loadChatAppearance } from './chatAppearance';
describe('chat appearance compatibility', () => {
  it('preserves old appearance and clamps invalid opacity', () => {
    saved.value = {};
    expect(loadChatAppearance()).toMatchObject({ chatOpacity: 1, showEmotionAccent: true, showEmotionLabel: true });
    saved.value = { chatOpacity: -2, showEmotionAccent: false, showEmotionLabel: false };
    expect(loadChatAppearance()).toMatchObject({ chatOpacity: 0.1, showEmotionAccent: false, showEmotionLabel: false });
    saved.value = { chatOpacity: Number.NaN };
    expect(loadChatAppearance().chatOpacity).toBe(1);
  });
});
