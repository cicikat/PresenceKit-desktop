import type { ChatArtifactPayload, ChatLogEntry } from '../../shared/api/types';
import { normalizeChatArtifacts } from '../../shared/api/chatArtifacts';

// Both initial history and pagination must restore sidecars, including file-only turns.
export function historyAssistantParts(entry: ChatLogEntry): { text: string; artifacts?: ChatArtifactPayload[] }[] {
  const artifacts = normalizeChatArtifacts(entry.artifacts);
  const parts = (entry.assistant_display_text || entry.assistant || '')
    .split(/\n+/).map(text => text.trim()).filter(Boolean);
  if (!parts.length && artifacts?.length) parts.push('');
  return parts.map((text, index) => ({ text, artifacts: index === 0 ? artifacts : undefined }));
}
