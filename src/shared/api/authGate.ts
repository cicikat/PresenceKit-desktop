import { RealitySessions, realityCommands, SessionPreparationError, type RealityGrant, type RealitySessionSnapshot } from './sessionScope';
import { getActiveCharacterInfo, subscribeActiveCharacter } from '../activeCharacter';
import { onClientConfigChange } from './config';
import { t } from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import { classifyHttpError } from './httpError';
import { runtimeDiagnostics } from '../runtimeDiagnostics';

// 全局"本地 token 失效"信号：任意经 invokeGated() 的请求收到 401，就置位。401 永远不会
// 自己重试变好（后端语义），因此这里不做重试，只广播一次状态，由 App 根组件的引导页门禁
// （src/features/onboarding/）订阅并接管界面，等用户重新填写 token 后清零（cc-tasks/35 §1/§2）。
const realitySessions = new RealitySessions();
realitySessions.selectCharacter(getActiveCharacterInfo().id);
subscribeActiveCharacter(info => realitySessions.selectCharacter(info.id));
onClientConfigChange(() => realitySessions.invalidateConnection());
let authInvalid = false;
const listeners = new Set<(invalid: boolean) => void>();

export function getAuthInvalid(): boolean {
  return authInvalid;
}

export function setAuthInvalid(invalid: boolean): void {
  if (authInvalid === invalid) return;
  authInvalid = invalid;
  listeners.forEach(listener => listener(invalid));
}

export function onAuthInvalidChange(listener: (invalid: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// backend.ts 的共享请求层：所有走后端 HTTP 的 Tauri command 都应经过这层，而不是各自裸调用
// invoke()（cc-tasks/35 §2 "不许各调用点自己写"）。401 在这里统一置位全局门禁信号；不在这里
// 做重试 —— 一次性动作（发消息等）交给调用方展示错误，轮询交给 backoffPoll.ts 的调度器处理。
export async function captureRealitySession(): Promise<RealitySessionSnapshot> {
  try {
    if (authInvalid) throw new Error('auth_invalid');
    const charId = getActiveCharacterInfo().id;
    realitySessions.selectCharacter(charId);
    const generation = realitySessions.generation;
    const connectionKey = await invoke<string>('reality_connection_key');
    if (generation !== realitySessions.generation) throw new Error('session_scope_stale');
    const grant = await realitySessions.acquire(charId, connectionKey,
      () => invoke<RealityGrant>('open_reality_session', { charId }));
    if (getActiveCharacterInfo().id !== charId) throw new Error('session_scope_stale');
    return Object.freeze({ grant, generation: realitySessions.generation });
  } catch (error) {
    if (classifyHttpError(error).kind === 'unauthorized') setAuthInvalid(true);
    throw new SessionPreparationError(t('chat.send.sessionUnavailable'));
  }
}

export async function isRealitySessionCurrent(scope: RealitySessionSnapshot): Promise<boolean> {
  const current = () => !authInvalid && scope.generation === realitySessions.generation &&
    scope.grant.char_id === getActiveCharacterInfo().id && scope.grant.expires_at > Date.now() / 1000;
  if (!current()) return false;
  try {
    const connection = await invoke<string>('reality_connection_key');
    return current() && scope.grant.connection_key === connection;
  } catch (error) {
    if (classifyHttpError(error).kind === 'unauthorized') setAuthInvalid(true);
    return false;
  }
}

export async function invokeGated<T>(cmd: string, args?: Record<string, unknown>, frozen?: RealitySessionSnapshot): Promise<T> {
  try {
    if (realityCommands.has(cmd)) {
      try {
        const scope = frozen ?? await captureRealitySession();
        if (!await isRealitySessionCurrent(scope)) throw new Error('session_scope_stale');
        args = { ...args, sessionId: scope.grant.session_id, connectionKey: scope.grant.connection_key };
      } catch (error) {
        if (classifyHttpError(error).kind === 'unauthorized') setAuthInvalid(true);
        throw new SessionPreparationError(t('chat.send.sessionUnavailable'));
      }
    }
    const result = await runtimeDiagnostics.measureCommand(cmd, () => invoke<T>(cmd, args));
    return result;
  } catch (err) {
    const classified = classifyHttpError(err);
    if (classified.kind === 'unauthorized') setAuthInvalid(true);
    if (realityCommands.has(cmd) && /\b(session_not_found|session_scope_required|character_not_authorized|character_revoked|character_unavailable)\b/.test(String(err))) {
      throw new SessionPreparationError(t('chat.send.sessionUnavailable'));
    }
    throw err;
  }
}
