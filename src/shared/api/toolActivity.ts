export interface ToolActivity {
  type: 'tool_activity';
  event_id: string;
  chain_id: string;
  char_id: string;
  source: 'reality';
  origin: 'chat' | 'autonomy';
  tool_name: string;
  status: 'running' | 'success' | 'error' | 'unknown' | 'pending_confirmation';
  ts: number;
}

export function isToolActivity(value: unknown): value is ToolActivity {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.type === 'tool_activity' && item.source === 'reality'
    && ['chat', 'autonomy'].includes(String(item.origin))
    && ['running', 'success', 'error', 'unknown', 'pending_confirmation'].includes(String(item.status))
    && ['event_id', 'chain_id', 'char_id', 'tool_name'].every(key => typeof item[key] === 'string' && (item[key] as string).length > 0 && (item[key] as string).length <= 128)
    && typeof item.ts === 'number' && Number.isFinite(item.ts) && item.ts > 0;
}

export function mergeToolActivity(previous: ToolActivity[], incoming: ToolActivity): ToolActivity[] {
  const found = previous.find(item => item.event_id === incoming.event_id);
  if (found && found.status !== 'running' && incoming.status === 'running') return previous;
  return found ? previous.map(item => item.event_id === incoming.event_id ? incoming : item) : [...previous, incoming];
}
