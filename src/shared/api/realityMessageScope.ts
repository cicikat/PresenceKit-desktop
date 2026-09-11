/** Routing metadata is optional for legacy single-character reality messages. */
export interface RealityMessageScope {
  source?: string;
  domain?: string;
  char_id?: string;
  round_id?: string;
}

export function isSingleRealityMessage(message: RealityMessageScope, activeCharacterId: string): boolean {
  return !message.round_id
    && (!message.source || message.source === 'reality')
    && (!message.domain || message.domain === 'reality')
    && (!message.char_id || message.char_id === activeCharacterId);
}
