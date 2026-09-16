import { expect, it, vi } from 'vitest';
vi.mock('./authGate', () => ({ invokeGated: vi.fn().mockResolvedValue(undefined) }));
import { invokeGated } from './authGate';
import { downloadChatArtifact, normalizeChatArtifacts, previewChatArtifact } from './chatArtifacts';

it('keeps bounded public fields and drops invalid ids', () => {
  expect(normalizeChatArtifacts([
    { id: 'aa'.repeat(16), filename: 'note.md', mime: 'text/markdown', size: 12, previewable: true, download_url: '/chat/artifacts/x', content: 'secret', path: 'C:\\\\abs' },
    { id: 'not-hex', filename: 'bad.txt', mime: 'text/plain', size: 1 },
    { filename: 'missing-id.md' },
  ])).toEqual([{
    id: 'aa'.repeat(16),
    filename: 'note.md',
    mime: 'text/markdown',
    size: 12,
    previewable: true,
    download_url: '/chat/artifacts/x',
    preview_url: undefined,
  }]);
  expect(normalizeChatArtifacts([])).toBeUndefined();
  expect(normalizeChatArtifacts('nope')).toBeUndefined();
});

it('uses gated Tauri commands for download and preview', async () => {
  await downloadChatArtifact('aa'.repeat(16), 'C:\\tmp\\note.md');
  expect(invokeGated).toHaveBeenCalledWith('download_chat_artifact', { artifactId: 'aa'.repeat(16), destPath: 'C:\\tmp\\note.md' });
  vi.mocked(invokeGated).mockResolvedValueOnce('<p>hi</p>');
  expect(await previewChatArtifact('bb'.repeat(16))).toBe('<p>hi</p>');
  expect(invokeGated).toHaveBeenLastCalledWith('preview_chat_artifact', { artifactId: 'bb'.repeat(16) });
});
