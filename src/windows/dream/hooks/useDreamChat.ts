import { useState, useCallback, useRef } from 'react';
import { dreamChat } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';
import type { NarrativeSegment } from '../../../shared/api/types';
import { armHttpPseudoStream } from '../../../shared/api/pseudoStreamText';
import { parseIncremental } from '../../../shared/api/incrementalNarrativeParser';

let _id = 0;
function newId() { return `dm-${Date.now()}-${++_id}`; }

function normalizeDreamText(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
}

// Dream chat is HTTP-primary: the reply text comes via the dreamChat() HTTP
// response. Brief 84 added a server-side pseudo-stream typewriter replay that
// plays over WS *before* that HTTP response resolves (same message_stream_*
// frames 1v1 owner chat uses); see armHttpPseudoStream for how frames are told
// apart from Stage/1v1 traffic on the same connection. Canonical
// `channel_message`/`message_segments` are still NOT subscribed here — the
// dream pipeline never pushes those over WS (backend invariant unchanged).
export function useDreamChat(onExited: () => void) {
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingActive, setStreamingActive] = useState(false);
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

    let streamId: string | null = null;
    let streamText = '';
    const disarmStream = armHttpPseudoStream(delta => {
      streamText += delta;
      const normalized = normalizeDreamText(streamText);
      // Recompute segments from the full accumulated buffer each delta (cc-tasks/33 §A):
      // the reply is short enough that a full re-parse is cheapest, and it naturally
      // gives the trailing in-flight segment its optimistic render (see parser doc comment).
      const segments = parseIncremental(normalized);
      if (streamId === null) {
        streamId = newId();
        setStreamingActive(true);
        const id = streamId;
        setMessages(prev => [...prev, { id, role: 'her', text: normalized, segments }]);
      } else {
        const id = streamId;
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: normalized, segments } : m)));
      }
    });

    try {
      const resp = await dreamChat(trimmed);
      disarmStream();
      if (resp.error) {
        if (streamId) {
          const id: string = streamId;
          setMessages(prev => prev.filter(m => m.id !== id));
        }
        setMessages(prev => [...prev, { id: newId(), role: 'system', text: `（${resp.error}）` }]);
      } else {
        if (resp.exit_accepted || resp.force_exited) {
          onExitedRef.current();
        }
        if (resp.reply) {
          const finalPatch = {
            text: normalizeDreamText(resp.reply),
            segments: resp.segments as NarrativeSegment[] | undefined,
            segmentedContent: resp.segmented_content ? normalizeDreamText(resp.segmented_content) : undefined,
          };
          if (streamId) {
            const id: string = streamId;
            setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...finalPatch } : m)));
          } else {
            setMessages(prev => [...prev, { id: newId(), role: 'her', ...finalPatch }]);
          }
        } else if (streamId) {
          const id: string = streamId;
          setMessages(prev => prev.filter(m => m.id !== id));
        }
      }
    } catch (e) {
      disarmStream();
      if (streamId) {
        const id: string = streamId;
        setMessages(prev => prev.filter(m => m.id !== id));
      }
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
      setStreamingActive(false);
    }
  }, []);

  return { messages, loading, streamingActive, send, addSystemMsg };
}
