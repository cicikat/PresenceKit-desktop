// 上线主动触发去抖：排除「重登 / 刷新」在短时间内重复触发 desktop_wake 问候。
// 用 localStorage 而非模块级变量，因为模块变量在 F5 / 重开窗口时会被重置，
// 正是要排除的误触发场景（cc-tasks/08 #2）。

const STORAGE_KEY = 'emerald.chat.lastDesktopWakeAt';

export const WAKE_MIN_GAP_MS = 10 * 60 * 1000;

export function shouldSkipDesktopWake(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const last = Number(raw);
    if (!Number.isFinite(last)) return false;
    return now - last < WAKE_MIN_GAP_MS;
  } catch {
    return false;
  }
}

export function markDesktopWakeFired(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // localStorage 不可用时退化为仅当前 session 内的 _desktopWakeFired 去抖。
  }
}
