import { invokeGated } from './authGate';

export type McpConsoleTool = {
  name: string;
  description: string;
  allowlisted: boolean;
  policy_status: 'confirmed' | 'legacy_allowed' | 'pending_confirmation' | 'not_allowlisted';
  registered: boolean;
  input_schema: Record<string, unknown>;
  effect: 'read' | 'write' | 'actuate' | 'emergency' | '';
  require_confirm: boolean;
};

export type McpConsoleServer = {
  name: string;
  enabled: boolean;
  runtime: { connected: boolean };
  tool_states: McpConsoleTool[];
};

export type McpConsoleSettings = {
  enabled: boolean;
  servers: McpConsoleServer[];
};

export type McpConsoleResult = {
  status: 'completed' | 'confirmation_required';
  audit_id: string;
  result?: string;
  confirmation_id?: string;
  confirmation_message?: string;
  expires_in_s?: number;
};

export async function getMcpConsoleSettings(): Promise<McpConsoleSettings> {
  return invokeGated<McpConsoleSettings>('get_mcp_console_settings');
}

export async function invokeMcpConsole(
  server: string,
  tool: string,
  arguments_: Record<string, unknown>,
): Promise<McpConsoleResult> {
  return invokeGated<McpConsoleResult>('invoke_mcp_console', { server, tool, arguments: arguments_ });
}

export async function confirmMcpConsole(confirmationId: string): Promise<McpConsoleResult> {
  return invokeGated<McpConsoleResult>('confirm_mcp_console', { confirmationId });
}
