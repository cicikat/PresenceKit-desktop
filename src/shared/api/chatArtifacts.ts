import { invokeGated } from './authGate';
import type { ChatArtifactPayload } from './types';

export const CHAT_ARTIFACT_ID_RE = /^[A-Fa-f0-9]{32}$/;
const MAX_TURN_ARTIFACTS = 4;
const MAX_FILENAME_CHARS = 80;

export function normalizeChatArtifacts(raw: unknown): ChatArtifactPayload[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: ChatArtifactPayload[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const filename = typeof rec.filename === 'string' ? rec.filename.trim() : '';
    if (!CHAT_ARTIFACT_ID_RE.test(id) || !filename) continue;
    const size = Number(rec.size);
    items.push({
      id,
      filename: filename.slice(0, MAX_FILENAME_CHARS),
      mime: typeof rec.mime === 'string' && rec.mime.trim() ? rec.mime : 'application/octet-stream',
      size: Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0,
      previewable: rec.previewable === true,
      download_url: typeof rec.download_url === 'string' ? rec.download_url : undefined,
      preview_url: typeof rec.preview_url === 'string' ? rec.preview_url : undefined,
    });
    if (items.length >= MAX_TURN_ARTIFACTS) break;
  }
  return items.length ? items : undefined;
}

export function downloadChatArtifact(artifactId: string, destPath: string): Promise<void> {
  return invokeGated<void>('download_chat_artifact', { artifactId, destPath });
}

export function previewChatArtifact(artifactId: string): Promise<string> {
  return invokeGated<string>('preview_chat_artifact', { artifactId });
}
