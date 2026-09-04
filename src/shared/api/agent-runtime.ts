import { invokeGated } from './authGate';

export type BrowserCapabilityState = 'enabled' | 'disabled' | 'unavailable' | 'remote_disabled';
export type AgentTaskStatus = 'queued' | 'running' | 'waiting_confirm' | 'paused' | 'succeeded' | 'failed' | 'canceled' | 'expired' | 'outcome_unknown' | 'unknown';

export interface BrowserCapabilitySnapshot {
  schema_version: string;
  enabled: boolean;
  allowed_domain_count: number;
  download_enabled: boolean;
  upload_enabled: boolean;
  worker_alive?: boolean;
  worker_active_count?: number;
  adapter_available: boolean;
  credentials_exposed: false;
  profile_exposed: false;
  effective_state?: BrowserCapabilityState | 'disabled_remote_server';
  reason_code?: string | null;
}

export interface AgentRuntimeArtifact {
  kind?: string;
  label?: string;
  id?: string;
  size_bytes?: number;
  truncated?: boolean;
}

export interface AgentRuntimeTask {
  task_id: string;
  status: AgentTaskStatus;
  capability?: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  queued_at?: string | number | null;
  started_at?: string | number | null;
  finished_at?: string | number | null;
  expires_at?: string | number | null;
  error_code?: string | null;
  attempt_count?: number;
  truncated?: boolean;
  artifacts?: AgentRuntimeArtifact[];
}

export interface AgentRuntimeTaskSnapshot {
  schema_version?: string;
  tasks: AgentRuntimeTask[];
  count: number;
}

export async function loadBrowserCapability(): Promise<BrowserCapabilitySnapshot> {
  return invokeGated<BrowserCapabilitySnapshot>('load_agent_runtime_browser');
}

export async function loadAgentRuntimeTasks(options: { charId?: string; status?: string; capability?: string; limit?: number } = {}): Promise<AgentRuntimeTaskSnapshot> {
  return invokeGated<AgentRuntimeTaskSnapshot>('load_agent_runtime_tasks', {
    charId: options.charId ?? null,
    status: options.status ?? null,
    capability: options.capability ?? null,
    limit: options.limit ?? 20,
  });
}

export interface BrowserTaskRequest {
  charId: string;
  url: string;
  operation: string;
  idempotencyKey: string;
  confirmed?: boolean;
  ttlSeconds?: number;
  params?: Record<string, unknown>;
}

export async function createAgentRuntimeBrowserTask(request: BrowserTaskRequest): Promise<AgentRuntimeTask> {
  return invokeGated<AgentRuntimeTask>('create_agent_runtime_browser_task', { ...request, ttlSeconds: request.ttlSeconds ?? 900, confirmed: request.confirmed ?? false, params: request.params ?? {} });
}

export async function runAgentRuntimeBrowserTask(taskId: string, request: BrowserTaskRequest): Promise<{ receipt: AgentRuntimeTask; result?: Record<string, unknown> | null }> {
  return invokeGated('run_agent_runtime_browser_task', { taskId, ...request, confirmed: request.confirmed ?? false, params: request.params ?? {} });
}

export async function confirmAgentRuntimeBrowserTask(taskId: string, charId: string): Promise<AgentRuntimeTask> {
  return invokeGated<AgentRuntimeTask>('confirm_agent_runtime_browser_task', { taskId, charId });
}

export async function pauseAgentRuntimeBrowserTask(taskId: string, charId: string): Promise<AgentRuntimeTask> {
  return invokeGated<AgentRuntimeTask>('pause_agent_runtime_browser_task', { taskId, charId });
}

export async function cancelAgentRuntimeTask(taskId: string, charId: string): Promise<AgentRuntimeTask> {
  return invokeGated<AgentRuntimeTask>('cancel_agent_runtime_task', { taskId, charId });
}

const TASK_STATUSES = new Set<AgentTaskStatus>(['queued', 'running', 'waiting_confirm', 'paused', 'succeeded', 'failed', 'canceled', 'expired', 'outcome_unknown']);

export function normalizeAgentRuntimeTask(value: unknown): AgentRuntimeTask | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.task_id !== 'string' || !raw.task_id) return null;
  const status = typeof raw.status === 'string' && TASK_STATUSES.has(raw.status as AgentTaskStatus) ? raw.status as AgentTaskStatus : 'unknown';
  const artifacts: AgentRuntimeArtifact[] = Array.isArray(raw.artifacts) ? raw.artifacts.map(item => {
    if (!item || typeof item !== 'object') return null;
    const a = item as Record<string, unknown>;
    return { kind: typeof a.kind === 'string' ? a.kind : undefined, label: typeof a.label === 'string' ? a.label : undefined, id: typeof a.id === 'string' ? a.id : undefined, size_bytes: typeof a.size_bytes === 'number' ? a.size_bytes : undefined, truncated: Boolean(a.truncated) };
  }).filter(item => item !== null) : [];
  const metadata = raw.result_metadata && typeof raw.result_metadata === 'object' ? raw.result_metadata as Record<string, unknown> : null;
  const metadataArtifact = metadata && Array.isArray(metadata.artifact_ids) ? metadata.artifact_ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128).slice(0, 10).map(id => ({ id, truncated: Boolean(metadata.truncated) })) : [];
  return { task_id: raw.task_id, status, capability: typeof raw.capability === 'string' ? raw.capability : undefined, created_at: typeof raw.created_at === 'string' || typeof raw.created_at === 'number' ? raw.created_at : null, updated_at: typeof raw.updated_at === 'string' || typeof raw.updated_at === 'number' ? raw.updated_at : null, queued_at: typeof raw.queued_at === 'string' || typeof raw.queued_at === 'number' ? raw.queued_at : null, started_at: typeof raw.started_at === 'string' || typeof raw.started_at === 'number' ? raw.started_at : null, finished_at: typeof raw.finished_at === 'string' || typeof raw.finished_at === 'number' ? raw.finished_at : null, expires_at: typeof raw.expires_at === 'string' || typeof raw.expires_at === 'number' ? raw.expires_at : null, error_code: typeof raw.error_code === 'string' ? raw.error_code : null, attempt_count: typeof raw.attempt_count === 'number' ? raw.attempt_count : 0, truncated: Boolean(raw.truncated) || Boolean(metadata?.truncated), artifacts: artifacts.length ? artifacts : metadataArtifact };
}

export function normalizeAgentRuntimeTaskSnapshot(value: unknown): AgentRuntimeTaskSnapshot {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const source = Array.isArray(raw.tasks) ? raw.tasks : (Array.isArray(raw.entries) ? raw.entries : []);
  const tasks = source.map(normalizeAgentRuntimeTask).filter((item): item is AgentRuntimeTask => item !== null);
  return { schema_version: typeof raw.schema_version === 'string' ? raw.schema_version : undefined, tasks, count: typeof raw.count === 'number' ? raw.count : tasks.length };
}

export function browserCapabilityState(snapshot: BrowserCapabilitySnapshot): BrowserCapabilityState {
  if (snapshot.effective_state === 'disabled_remote_server') return 'remote_disabled';
  if (snapshot.effective_state === 'remote_disabled') return 'remote_disabled';
  if (snapshot.effective_state === 'disabled') return 'disabled';
  if (snapshot.effective_state === 'unavailable') return 'unavailable';
  if (snapshot.effective_state === 'enabled' && !snapshot.adapter_available) return 'unavailable';
  if (snapshot.effective_state === 'enabled') return 'enabled';
  if (!snapshot.enabled) return 'disabled';
  if (!snapshot.adapter_available) return 'unavailable';
  return 'enabled';
}
