import { invokeGated } from './authGate';
import type { TurnReasoning } from './turnReasoningState';

export function loadTurnReasoning(turnId: string): Promise<TurnReasoning> {
  return invokeGated<TurnReasoning>('load_turn_reasoning', { turnId });
}
