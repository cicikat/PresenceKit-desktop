import { useState, useCallback, useRef } from 'react';
import { dreamChat } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';
import type { NarrativeSegment } from '../../../shared/api/types';
import { armHttpPseudoStream } from '../../../shared/api/pseudoStreamText';
import { parseIncremental } from '../../../shared/api/incrementalNarrativeParser';
import { mapCanonicalDreamMessage, normalizeDreamText } from '../dreamMessage';

let _id = 0;
function newId() { return `dm-${Date.now()}-${++_id}`; }
const MAX_DREAM_MESSAGES = 120;
const appendCapped = <T,>(items: T[], item: T) => [...items, item].slice(-MAX_DREAM_MESSAGES);

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
  const streamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStream = useRef<{ text: string; id: string | null }>({ text: '', id: null });
  function setLoadingState(v: boolean) {
    loadingRef.current = v;
    setLoading(v);
  }

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => appendCapped(prev, { id: newId(), role: 'system', text }));
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = normalizeDreamText(text.trim());
    if (!trimmed) return;

    setMessages(prev => appendCapped(prev, { id: newId(), role: 'user', text: trimmed }));
    setLoadingState(true);

    let streamId: string | null = null;
    let streamText = '';
    const disarmStream = armHttpPseudoStream(delta => {
      streamText += delta;
      const normalized = normalizeDreamText(streamText);
      // Recompute segments from the full accumulated buffer each delta (cc-tasks/33 §A):
      // the reply is short enough that a full re-parse is cheapest, and it naturally
      // gives the trailing in-flight segment its optimistic render (see parser doc comment).
      pendingStream.current = { text: normalized, id: streamId };
      if (!streamTimer.current) streamTimer.current = setTimeout(() => {
        streamTimer.current = null;
        const batch = pendingStream.current;
        const segments = parseIncremental(batch.text);
        if (batch.id === null) { const id = newId(); streamId = id; pendingStream.current.id = id; setStreamingActive(true); setMessages(prev => appendCapped(prev, { id, role: 'her', text: batch.text, segments })); }
        else setMessages(prev => prev.map(m => m.id === batch.id ? { ...m, text: batch.text, segments } : m));
      }, 40);
    });

    try {
      const resp = await dreamChat(trimmed);
      if (streamTimer.current) { clearTimeout(streamTimer.current); streamTimer.current = null; const batch = pendingStream.current; if (batch.id) setMessages(prev => prev.map(m => m.id === batch.id ? { ...m, text: batch.text, segments: parseIncremental(batch.text) } : m)); streamId = batch.id; }
      disarmStream();
      if (resp.error) {
        if (streamId) {
          const id: string = streamId;
          setMessages(prev => prev.filter(m => m.id !== id));
        }
        setMessages(prev => [...prev, { id: newId(), role: 'system', text: `（${resp.error}）` }]);
      } else {
        if (resp.reply) {
          const finalMessage = mapCanonicalDreamMessage({
            id: streamId || newId(),
            role: 'her',
            text: resp.reply,
            segments: resp.segments,
            segmentedContent: resp.segmented_content,
          });
          if (streamId) {
            const id: string = streamId;
            setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...finalMessage, id } : m)));
          } else {
            setMessages(prev => appendCapped(prev, finalMessage));
          }
        } else if (streamId) {
          const id: string = streamId;
          setMessages(prev => prev.filter(m => m.id !== id));
        }
        // Finalize the visible Dream reply before asking the window to close.
        // This prevents the HTTP/poll close race from unmounting the panel
        // before the canonical final message replaces the pseudo-stream.
        if (resp.exit_accepted || resp.force_exited) {
          onExitedRef.current();
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
