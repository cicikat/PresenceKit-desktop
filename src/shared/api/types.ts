export type ServerMessage =
  | { type: 'hello_ack'; server_version: string }
  | { type: 'channel_message'; content: string; msg_id: string }
  | { type: 'action'; action: Record<string, unknown>; msg_id: string }
  | { type: 'ping' };

export type ClientMessage =
  | { type: 'hello'; client: string; version: string }
  | { type: 'ack'; msg_id: string; ok: boolean; error?: string }
  | { type: 'pong' };

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export interface ChatResponse {
  reply: string;
  emotion: string;
}
