// 分类 Rust 侧 invoke() 抛回的错误字符串（形如 "HTTP 401: ..." / "HTTP 429: ...|retry_after=30"，
// 见 src-tauri/src/lib.rs safe_http_error_message）。纯函数，供共享退避调度器和各处人话化展示复用，
// 避免每个调用点各自写一遍状态码正则（cc-tasks/34 §2 / cc-tasks/35 §2）。
export type HttpErrorKind = 'unauthorized' | 'rateLimited' | 'network' | 'other';

export interface ClassifiedHttpError {
  kind: HttpErrorKind;
  status: number | null;
  /** 429 响应携带 Retry-After 时的秒数；缺失时为 null，调用方应退回指数退避。 */
  retryAfterSeconds: number | null;
  /** 已剥离 retry_after 元数据后缀、便于直接展示给用户的原始文案。 */
  message: string;
}

const STATUS_RE = /\bHTTP (\d+)/;
const RETRY_AFTER_RE = /\|retry_after=(\d+)\s*$/;

export function classifyHttpError(err: unknown): ClassifiedHttpError {
  const raw = err instanceof Error ? err.message : String(err);
  const statusMatch = raw.match(STATUS_RE);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  const retryMatch = raw.match(RETRY_AFTER_RE);
  const retryAfterSeconds = retryMatch ? Number(retryMatch[1]) : null;
  const message = retryMatch ? raw.slice(0, retryMatch.index) : raw;

  let kind: HttpErrorKind = 'other';
  if (status === 401) kind = 'unauthorized';
  else if (status === 429) kind = 'rateLimited';
  else if (status === null) kind = 'network';

  return { kind, status, retryAfterSeconds, message };
}
