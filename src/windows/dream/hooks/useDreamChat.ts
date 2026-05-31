import { useState, useCallback, useRef, useEffect } from 'react';
import { dreamChat } from '../../../shared/api/dream';
import { getClientConfig } from '../../../shared/api/config';
import { wsClient } from '../../../shared/api/ws';
import type { DreamMessage } from '../../../shared/api/dream-types';
import type { NarrativeSegment } from '../../../shared/api/types';

let _id = 0;
function newId() { return `dm-${Date.now()}-${++_id}`; }

function normalizeDreamText(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

export function useDreamChat(onExited: () => void) {
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  // Track loading via ref so WS handler can read current value synchronously
  const loadingRef = useRef(false);
  function setLoadingState(v: boolean) {
    loadingRef.current = v;
    setLoading(v);
  }

  // WS correlation: ws msg_id → local DreamMessage id
  const wsMsgIdToLocalIdRef = useRef<Map<string, string>>(new Map());
  // Out-of-order: message_segments arrives before channel_message
  const pendingSegmentsByMsgIdRef = useRef<Map<string, { content: string; segments: NarrativeSegment[] }>>(new Map());

  // HTTP fallback tracking per send:
  // - wsAddedReplyRef: WS channel_message arrived and added a message for the current send
  // - httpFallbackLocalIdRef: local id of the HTTP-fallback message we added (null if none)
  const wsAddedReplyRef = useRef(false);
  const httpFallbackLocalIdRef = useRef<string | null>(null);

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
  }, []);

  // Subscribe to WS channel_message and message_segments
  useEffect(() => {
    let mounted = true;

    getClientConfig().then(cfg => {
      if (mounted) wsClient.connect(cfg.websocketBase);
    });

    const unsubMsg = wsClient.on('channel_message', ({ content, msg_id }) => {
      // Clear loading indicator as soon as the reply starts arriving
      if (loadingRef.current) setLoadingState(false);

      wsAddedReplyRef.current = true;

      const localId = newId();
      const pending = pendingSegmentsByMsgIdRef.current.get(msg_id);
      if (pending) pendingSegmentsByMsgIdRef.current.delete(msg_id);

      wsMsgIdToLocalIdRef.current.set(msg_id, localId);

      const wsMessage: DreamMessage = {
        id: localId,
        role: 'her',
        text: normalizeDreamText(content),
        wsMsgId: msg_id,
        segments: pending?.segments,
        segmentedContent: pending ? normalizeDreamText(pending.content) : undefined,
      };

      // If HTTP fallback already added a message for this send, replace it with the
      // proper WS message (which carries msg_id and segment correlation).
      const fallbackId = httpFallbackLocalIdRef.current;
      if (fallbackId) {
        httpFallbackLocalIdRef.current = null;
        setMessages(prev => prev.map(m => m.id === fallbackId ? wsMessage : m));
      } else {
        setMessages(prev => [...prev, wsMessage]);
      }
    });

    const unsubSegs = wsClient.on('message_segments', ({ content, segments, msg_id }) => {
      const localId = wsMsgIdToLocalIdRef.current.get(msg_id);
      if (localId) {
        // channel_message already arrived — update in place
        setMessages(prev => prev.map(m =>
          m.id === localId
            ? { ...m, segments, segmentedContent: normalizeDreamText(content) }
            : m
        ));
      } else {
        // channel_message hasn't arrived yet — park for later
        pendingSegmentsByMsgIdRef.current.set(msg_id, { content, segments });
      }
    });

    return () => {
      mounted = false;
      unsubMsg();
      unsubSegs();
    };
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = normalizeDreamText(text.trim());
    if (!trimmed) return;

    // Reset per-send WS/HTTP fallback tracking
    wsAddedReplyRef.current = false;
    httpFallbackLocalIdRef.current = null;

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
        // HTTP fallback: if WS channel_message hasn't already delivered the reply,
        // show resp.reply immediately. If WS arrives later it will replace this message.
        if (resp.reply && !wsAddedReplyRef.current) {
          const fallbackId = newId();
          httpFallbackLocalIdRef.current = fallbackId;
          setMessages(prev => [...prev, {
            id: fallbackId,
            role: 'her',
            text: normalizeDreamText(resp.reply),
          }]);
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
      // Clear loading regardless — WS may have already cleared it
      setLoadingState(false);
    }
  }, []);

  return { messages, loading, send, addSystemMsg };
}
