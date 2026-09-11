import type { TurnReasoning } from '../../shared/api/turnReasoningState';

interface ReasoningMessage {
  id: string;
  role: string;
  turnId?: string;
  wsMsgId?: string;
  reasoningPending?: boolean;
  isStreaming?: boolean;
}

/** The first assistant segment anchors one narration per canonical reply. */
export function reasoningAnchors(messages: readonly ReasoningMessage[]): Set<string> {
  const seen = new Set<string>();
  const anchors = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const identity = message.turnId?.trim() || (message.reasoningPending ? message.wsMsgId?.trim() : undefined);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    anchors.add(message.id);
  }
  return anchors;
}

/** Preserve all returned text in call order; metadata belongs outside the narration. */
export function reasoningNarrationText(data: TurnReasoning): string {
  if (!data.available) return '';
  return data.entries.flatMap(entry => entry.parts.map(part => part.text))
    .filter(text => text.trim().length > 0).join('\n\n');
}
