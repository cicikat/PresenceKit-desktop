import { describe, expect, it, vi } from 'vitest';
import { createObjectUrlFromBase64, createResourceDisposer } from './disposer';

describe('design satellite resource disposer', () => {
  it('releases each resource once and releases late resources immediately', () => {
    const disposer = createResourceDisposer();
    const cleanup = vi.fn();
    const remove = disposer.add(cleanup);
    disposer.dispose();
    disposer.dispose();
    remove();
    expect(cleanup).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    disposer.add(late);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('creates a typed Blob URL and exposes a one-shot revoke callback', () => {
    const url = 'blob:test';
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue(url);
    const revoke = vi.fn();
    expect(createObjectUrlFromBase64({ mime: 'image/png', base64: 'aGk=' }, revoke)).toBe(url);
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((create.mock.calls[0][0] as Blob).type).toBe('image/png');
    expect(revoke).toHaveBeenCalledWith(url);
    create.mockRestore();
  });
});
