import { useState, useCallback, useRef } from 'react';
import { dreamChat } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';
import type { NarrativeSegment } from '../../../shared/api/types';

let _id = 0;
function newId() { return `dm-${Date.now()}-${++_id}`; }

function normalizeDreamText(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

// Dream chat is HTTP-primary: replies come via the dreamChat() HTTP response.
// WS channel_message is NOT subscribed here — all WS channel_messages are
// source="reality" (backend invariant), and the dream pipeline never pushes
// via WS. Subscribing here would cause reality scheduler triggers to appear
// in the Dream UI during REALITY_AFTERGLOW or race windows (P0 dream leak fix).
export function useDreamChat(onExited: () => void) {
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  const loadingRef = useRef(false);
  function setLoadingState(v: boolean) {
    loadingRef.current = v;
    setLoading(v);
  }

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = normalizeDreamText(text.trim());
    if (!trimmed) return;

    setMessages(prev => [...prev, { id: newId(), role: 'user', text: trimmed }]);
    setLoadingState(true);
    try {
      const resp = await dreamChat(trimmed);
      if (resp.error) {
        setMessages(prev => [...prev, { id: newId(), role: 'system', text: `（${resp.error}）` }]);
      } else {
        if (resp.exit_accepted || resp.force_exited) {
          onExitedRef.current();
        }
        if (resp.reply) {
          const localId = newId();
          const msg: DreamMessage = {
            id: localId,
            role: 'her',
            text: normalizeDreamText(resp.reply),
            segments: resp.segments as NarrativeSegment[] | undefined,
            segmentedContent: resp.segmented_content ? normalizeDreamText(resp.segmented_content) : undefined,
          };
          setMessages(prev => [...prev, msg]);
        }
      }
    } catch (e) {
      const msg = String(e);
      const m = msg.match(/\bHTTP (\d+)/);
      const status = m ? parseInt(m[1], 10) : null;
      let errText: string;
      if (status === 409) errText = '（状态错误：当前不在梦境中）';
      else if (status === 503) errText = '（服务暂不可用）';
      else errText = `（发送失败：${msg}）`;
      setMessages(prev => [...prev, { id: newId(), role: 'system', text: errText }]);
    } finally {
      setLoadingState(false);
    }
  }, []);

  return { messages, loading, send, addSystemMsg };
}
