import type { ChatArtifactPayload, ChatLogEntry } from '../../shared/api/types';
import { normalizeChatArtifacts } from '../../shared/api/chatArtifacts';
import { splitReplyParagraphs } from './replyParagraphs';

// Both initial history and pagination must restore sidecars, including file-only turns.
export function historyAssistantParts(entry: ChatLogEntry): { text: string; artifacts?: ChatArtifactPayload[] }[] {
  const artifacts = normalizeChatArtifacts(entry.artifacts);
  const parts = splitReplyParagraphs(historyVisibleText(entry.assistant_display_text || entry.assistant || ''));
  if (!parts.length && artifacts?.length) parts.push('');
  return parts.map((text, index) => ({ text, artifacts: index === 0 ? artifacts : undefined }));
}

// Legacy servers may include a writer footer on an unanswered history row.
export function historyVisibleText(text: string): string {
  return text.trimEnd().replace(/(?:^|\r?\n)[ \t]*\\?>[ \t]*speaker:(?:user|assistant)(?:[ \t]+(?:turn_id|emotion|intensity|trigger|source|modality|asr_low):\S+)*[ \t]*$/, '').trimEnd();
}
