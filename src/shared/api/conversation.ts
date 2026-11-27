import { captureRealitySession, invokeGated, isRealitySessionCurrent } from './authGate';
export interface Execution { execution_id: string; request_id: string; state: string; turn_id: string }
export interface ConversationState { revision: number; executions: Execution[]; recent_terminal: Execution[]; withdrawn_requests: string[]; visibility: {turn_id: string; hidden: number; revision: number}[] }
export interface DeletedTurn { deletion_id: string; turn_id: string; state: string; created_at: number; revision: number }
export interface DeletedDetail extends DeletedTurn {
  history: {entry: {role: string; content: unknown}}[];
  events: {actor: string; visible_text: string}[];
  stopped: {user_text: string; assistant_text: string}[];
}
export async function conversationRequest<T>(action: string, identifier = '', body: Record<string, unknown> = {}): Promise<T> {
  const frozen = await captureRealitySession();
  const result = await invokeGated<T>('conversation_request', {action, identifier, body}, frozen);
  if (!await isRealitySessionCurrent(frozen)) throw new Error('session_scope_stale');
  return result;
}
export const operationId = () => crypto.randomUUID();
export const getConversationState = () => conversationRequest<ConversationState>('state');
export function visibleConversationMessages<T extends {turnId?: string; id: string; wsMsgId?: string}>(messages: T[], hidden: Set<string>, retired: Set<string>): T[] {
  return messages.filter(item => !(item.turnId && hidden.has(item.turnId)) && !retired.has(item.id) && !(item.wsMsgId && retired.has(item.wsMsgId)));
}

export function selectExecutionToStop(executions: Execution[]): Execution | undefined {
  return executions.find(item=>item.state==='running') ?? executions.find(item=>item.state==='stop_requested') ?? executions.find(item=>item.state==='queued');
}
