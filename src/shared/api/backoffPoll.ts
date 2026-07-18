import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyHttpError, type ClassifiedHttpError } from './httpError';

// 通用"轮询 + 指数退避"调度器，替换 ChatPanel/useDreamState 里各自手写的固定间隔
// setInterval(fn, 5000/8000) 重试（cc-tasks/35 §2 "统一重试策略...不许各调用点自己写"）：
// - 成功：退避重置回 baseIntervalMs。
// - 401：立即停止调度（不再自动重试——重试永远不会让失效的 token 变好），并通知调用方
//   （用于触发全局引导页门禁，或 Dream 内的就地引导）。
// - 429/网络错误：指数退避 + 抖动，上限 maxBackoffMs（默认 60s）；429 响应带
//   Retry-After 秒数时优先遵守（见 httpError.ts 对 "|retry_after=N" 后缀的解析）。
export interface PollingBackoffOptions {
  baseIntervalMs: number;
  maxBackoffMs?: number;
  onUnauthorized?: () => void;
  /** 关闭时清空定时器、不发请求（例如所在窗口/面板未激活）。默认 true。 */
  enabled?: boolean;
}

export interface PollingBackoffState {
  error: ClassifiedHttpError | null;
  /** 退避等待中的剩余秒数；空闲或未退避时为 null，供 UI 显示"连接受限，xx 秒后重试"。 */
  backoffSeconds: number | null;
  /** 立即重试一次（清空退避计时，含从 401 停止状态恢复）。 */
  retryNow: () => void;
}

export function usePollingBackoff(
  fetcher: () => Promise<void>,
  options: PollingBackoffOptions,
): PollingBackoffState {
  const { baseIntervalMs, maxBackoffMs = 60_000, enabled = true } = options;
  const [error, setError] = useState<ClassifiedHttpError | null>(null);
  const [backoffSeconds, setBackoffSeconds] = useState<number | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onUnauthorizedRef = useRef(options.onUnauthorized);
  onUnauthorizedRef.current = options.onUnauthorized;

  const timerRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const currentDelayRef = useRef(baseIntervalMs);
  // 每次 (re)start 递增；异步 tick 完成时比对，防止过期的调度链在 retryNow/卸载后继续跑。
  const generationRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (countdownRef.current !== null) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const runCountdown = useCallback((totalSeconds: number) => {
    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    let remaining = totalSeconds;
    setBackoffSeconds(remaining);
    countdownRef.current = window.setInterval(() => {
      remaining -= 1;
      setBackoffSeconds(Math.max(remaining, 0));
      if (remaining <= 0 && countdownRef.current !== null) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }, 1000);
  }, []);

  const runFrom = useCallback((generation: number, delayMs: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      if (generationRef.current !== generation) return;
      try {
        await fetcherRef.current();
        if (generationRef.current !== generation) return;
        setError(null);
        setBackoffSeconds(null);
        currentDelayRef.current = baseIntervalMs;
        runFrom(generation, baseIntervalMs);
      } catch (err) {
        if (generationRef.current !== generation) return;
        const classified = classifyHttpError(err);
        setError(classified);
        if (classified.kind === 'unauthorized') {
          clearTimers();
          setBackoffSeconds(null);
          onUnauthorizedRef.current?.();
          return;
        }
        const next = classified.retryAfterSeconds !== null
          ? classified.retryAfterSeconds * 1000
          : Math.min(currentDelayRef.current * 2, maxBackoffMs);
        currentDelayRef.current = Math.min(next, maxBackoffMs);
        const jittered = Math.round(currentDelayRef.current * (0.85 + Math.random() * 0.3));
        runCountdown(Math.round(jittered / 1000));
        runFrom(generation, jittered);
      }
    }, delayMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseIntervalMs, maxBackoffMs, clearTimers, runCountdown]);

  const retryNow = useCallback(() => {
    generationRef.current += 1;
    clearTimers();
    currentDelayRef.current = baseIntervalMs;
    setError(null);
    setBackoffSeconds(null);
    runFrom(generationRef.current, 0);
  }, [baseIntervalMs, clearTimers, runFrom]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      clearTimers();
      setBackoffSeconds(null);
      return;
    }
    generationRef.current += 1;
    currentDelayRef.current = baseIntervalMs;
    runFrom(generationRef.current, 0);
    return () => {
      generationRef.current += 1;
      clearTimers();
    };
  }, [enabled, baseIntervalMs, clearTimers, runFrom]);

  return { error, backoffSeconds, retryNow };
}
