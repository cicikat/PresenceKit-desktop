import { expect, it, vi } from 'vitest';
vi.mock('./authGate', () => ({ invokeGated: vi.fn().mockResolvedValue({ turn_id: 'canonical', available: false, entries: [] }) }));
import { invokeGated } from './authGate';
import { loadTurnReasoning } from './turnReasoning';

it('uses the gated Tauri command with the canonical turnId argument', async () => {
  expect(await loadTurnReasoning('canonical')).toEqual({ turn_id: 'canonical', available: false, entries: [] });
  expect(invokeGated).toHaveBeenCalledExactlyOnceWith('load_turn_reasoning', { turnId: 'canonical' });
});
