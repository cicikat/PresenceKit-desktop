import { useState, useCallback, useRef } from 'react';
import { dreamChat } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';

let _id = 0;
function newId() { return `dm-${Date.now()}-${++_id}`; }

export function useDreamChat(onExited: () => void) {
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { id: newId(), role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const resp = await dreamChat(trimmed);
      if (resp.error) {
        setMessages(prev => [...prev, { id: newId(), role: 'system', text: `（${resp.error}）` }]);
      } else {
        setMessages(prev => [...prev, { id: newId(), role: 'her', text: resp.reply }]);
        if (resp.exit_accepted || resp.force_exited) {
          onExitedRef.current();
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
      setLoading(false);
    }
  }, []);

  return { messages, loading, send, addSystemMsg };
}
