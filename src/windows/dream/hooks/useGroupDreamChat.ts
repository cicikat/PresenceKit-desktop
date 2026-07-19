import { useCallback, useEffect, useRef, useState } from 'react';
import { dreamGroupChat } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';
import { wsClient } from '../../../shared/api/ws';
import { parseIncremental } from '../../../shared/api/incrementalNarrativeParser';
import { useI18n } from '../../../shared/i18n';
import { belongsToOpenGroupDream, isOpenGroupDreamRound } from '../groupDreamRouting';

let nextId = 0;
const newId = () => `gdm-${Date.now()}-${++nextId}`;
const normalize = (text: string) => text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');

export function useGroupDreamChat(groupId: string | null) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingActive, setStreamingActive] = useState(false);
  const streamIds = useRef(new Map<string, string>());
  const streamText = useRef(new Map<string, string>());
  const liveStreams = useRef(new Set<string>());
  const activeRounds = useRef(new Set<string>());
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishRound = useCallback((roundId?: string) => {
    if (roundId) activeRounds.current.delete(roundId);
    if (activeRounds.current.size === 0) {
      setLoading(false);
      setStreamingActive(false);
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
      loadingTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const belongs = (domain?: string, roundId?: string) => belongsToOpenGroupDream(domain, roundId, activeRounds.current);

    const offStart = wsClient.on('message_stream_start', ({ msg_id, domain, char_id, round_id }) => {
      if (!char_id || !belongs(domain, round_id)) return;
      if (round_id) activeRounds.current.add(round_id);
      const id = newId();
      streamIds.current.set(msg_id, id);
      streamText.current.set(msg_id, '');
      liveStreams.current.add(msg_id);
      setStreamingActive(true);
      setMessages(prev => [...prev, { id, role: 'her', text: '', speakerId: char_id, roundId: round_id, wsMsgId: msg_id }]);
    });
    const offDelta = wsClient.on('message_stream_delta', ({ msg_id, delta }) => {
      const id = streamIds.current.get(msg_id);
      if (!id) return;
      const text = normalize((streamText.current.get(msg_id) ?? '') + delta);
      streamText.current.set(msg_id, text);
      setMessages(prev => prev.map(message => message.id === id
        ? { ...message, text, segments: parseIncremental(text) }
        : message));
    });
    const offEnd = wsClient.on('message_stream_end', ({ msg_id }) => {
      if (!streamIds.current.has(msg_id)) return;
      streamText.current.delete(msg_id);
      liveStreams.current.delete(msg_id);
      setStreamingActive(liveStreams.current.size > 0);
    });
    const offSegments = wsClient.on('message_segments', ({ msg_id, content, segments, domain, char_id, round_id }) => {
      if (!char_id || !belongs(domain, round_id)) return;
      const id = streamIds.current.get(msg_id);
      const patch = { text: normalize(content), segmentedContent: normalize(content), segments, speakerId: char_id, roundId: round_id, wsMsgId: msg_id };
      setMessages(prev => {
        const existing = prev.find(message => message.id === id || message.wsMsgId === msg_id);
        if (existing) return prev.map(message => message.id === existing.id ? { ...message, ...patch } : message);
        return [...prev, { id: newId(), role: 'her', ...patch }];
      });
      streamIds.current.delete(msg_id);
      streamText.current.delete(msg_id);
      liveStreams.current.delete(msg_id);
    });
    const offMessage = wsClient.on('channel_message', ({ msg_id, content, domain, char_id, round_id }) => {
      if (!char_id || !belongs(domain, round_id)) return;
      const id = streamIds.current.get(msg_id);
      const patch = { text: normalize(content), speakerId: char_id, roundId: round_id, wsMsgId: msg_id };
      if (id) {
        setMessages(prev => prev.map(message => message.id === id ? { ...message, ...patch } : message));
      } else {
        setMessages(prev => prev.some(message => message.wsMsgId === msg_id) ? prev : [...prev, { id: newId(), role: 'her', ...patch }]);
      }
      streamIds.current.delete(msg_id);
      streamText.current.delete(msg_id);
      liveStreams.current.delete(msg_id);
    });
    const offRoundStart = wsClient.on('group_round_start', ({ group_id, round_id, domain }) => {
      if (!isOpenGroupDreamRound(group_id, groupId, domain)) return;
      activeRounds.current.add(round_id);
      setLoading(true);
    });
    const offRoundEnd = wsClient.on('group_round_end', ({ group_id, round_id, domain }) => {
      if (!isOpenGroupDreamRound(group_id, groupId, domain)) return;
      finishRound(round_id);
    });
    return () => {
      offStart(); offDelta(); offEnd(); offSegments(); offMessage(); offRoundStart(); offRoundEnd();
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
      streamIds.current.clear(); streamText.current.clear(); liveStreams.current.clear(); activeRounds.current.clear();
    };
  }, [finishRound, groupId]);

  const send = useCallback(async (text: string) => {
    if (!groupId) return;
    const trimmed = normalize(text.trim());
    if (!trimmed) return;
    setMessages(prev => [...prev, { id: newId(), role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const response = await dreamGroupChat(groupId, trimmed);
      activeRounds.current.add(response.round_id);
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
      loadingTimer.current = setTimeout(() => finishRound(response.round_id), 30_000);
    } catch (error) {
      setLoading(false);
      const status = String(error).match(/\bHTTP (\d+)/)?.[1];
      const text = status === '409' ? t('groupDream.error.conflict') : t('groupDream.error.sendFailed');
      setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
    }
  }, [finishRound, groupId, t]);

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
  }, []);

  return { messages, loading, streamingActive, send, addSystemMsg };
}
