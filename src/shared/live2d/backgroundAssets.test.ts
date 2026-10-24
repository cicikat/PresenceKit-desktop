import { describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { backgroundSource, backgroundUrl } from './backgroundAssets';

describe('local background library', () => {
  it('round-trips Unicode names and subfolders through the native image reader', async () => {
    invoke.mockResolvedValueOnce('data:image/png;base64,test');
    const url = backgroundUrl('场景/现代 叶瑄家.png');
    expect(await backgroundSource(url)).toBe('data:image/png;base64,test');
    expect(invoke).toHaveBeenCalledWith('read_live2d_background', { file: '场景/现代 叶瑄家.png' });
  });
  it('keeps saved custom backgrounds compatible', async () => {
    invoke.mockClear();
    expect(await backgroundSource('/custom/background.jpg')).toBe('/custom/background.jpg');
    expect(invoke).not.toHaveBeenCalled();
  });
});
