import { useCallback, useState } from 'react';
import { dreamGetState } from '../../../shared/api/dream';
import type { DreamState } from '../../../shared/api/dream-types';
import { usePollingBackoff } from '../../../shared/api/backoffPoll';

const POLL_MS = 8_000;

// 轮询退避见 backoffPoll.ts（cc-tasks/35 §2）：成功重置回 8s；429/网络错误指数退避+抖动，
// 上限 60s；401 立即停止轮询（不在这里弹全局引导页——Dream 自己的 401 就地引导在
// DreamWindow.handleEnter 里处理，见 cc-tasks/35 §3），等 refresh() 被重新调用（进入梦境
// 成功后）才恢复。
export function useDreamState() {
  const [dreamState, setDreamState] = useState<DreamState | null>(null);

  const fetcher = useCallback(async () => {
    const s = await dreamGetState();
    console.debug('[Dream] getState ok:', s.status, s);
    setDreamState(s);
  }, []);

  const { error, retryNow } = usePollingBackoff(fetcher, { baseIntervalMs: POLL_MS });

  return { dreamState, stateError: error?.message ?? null, refresh: retryNow };
}
