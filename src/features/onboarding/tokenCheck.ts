import type { TokenStatus } from '../../shared/api/connectionSettings';

export const TOKEN_CHECK_TIMEOUT_MS = 8_000;

export class TokenCheckTimeoutError extends Error {
  constructor() { super('token status check timed out'); this.name = 'TokenCheckTimeoutError'; }
}

export async function checkTokenStatus(
  getStatus: () => Promise<TokenStatus>,
  timeoutMs = TOKEN_CHECK_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<TokenStatus> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return new Promise<TokenStatus>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => finishReject(new TokenCheckTimeoutError()), timeoutMs);
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const finishResolve = (value: TokenStatus) => { if (settled) return; settled = true; cleanup(); resolve(value); };
    const finishReject = (error: unknown) => { if (settled) return; settled = true; cleanup(); reject(error); };
    const abort = () => finishReject(new DOMException('aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    getStatus().then(finishResolve, finishReject);
  });
}
