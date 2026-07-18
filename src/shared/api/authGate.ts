import { invoke } from '@tauri-apps/api/core';
import { classifyHttpError } from './httpError';

// 全局"本地 token 失效"信号：任意经 invokeGated() 的请求收到 401，就置位。401 永远不会
// 自己重试变好（后端语义），因此这里不做重试，只广播一次状态，由 App 根组件的引导页门禁
// （src/features/onboarding/）订阅并接管界面，等用户重新填写 token 后清零（cc-tasks/35 §1/§2）。
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
export async function invokeGated<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const result = await invoke<T>(cmd, args);
    return result;
  } catch (err) {
    const classified = classifyHttpError(err);
    if (classified.kind === 'unauthorized') setAuthInvalid(true);
    throw err;
  }
}
