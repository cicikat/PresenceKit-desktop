import { useCallback, useEffect, useRef, useState } from 'react';
import { dreamGroupChat, dreamGroupGetState } from '../../../shared/api/dream';
import type { DreamMessage } from '../../../shared/api/dream-types';
import { wsClient } from '../../../shared/api/ws';
import { parseIncremental } from '../../../shared/api/incrementalNarrativeParser';
import { useI18n } from '../../../shared/i18n';
import { belongsToOpenGroupDream, isOpenGroupDreamRound } from '../groupDreamRouting';
import { GROUP_DREAM_ROUND_RECOVERY_DELAY_MS, isTerminalGroupDreamRound, terminalGroupDreamRoundError } from '../groupRoundRecovery';

let nextId = 0;
const newId = () => `gdm-${Date.now()}-${++nextId}`;
const normalize = (text: string) => text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
const httpStatus = (error: unknown) => String(error).match(/\bHTTP (\d+)/)?.[1];

export function useGroupDreamChat(groupId: string | null) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<DreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingActive, setStreamingActive] = useState(false);
  const streamIds = useRef(new Map<string, string>());
  const streamText = useRef(new Map<string, string>());
  const liveStreams = useRef(new Set<string>());
  const activeRounds = useRef(new Set<string>());
  const repliedRounds = useRef(new Set<string>());
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  const clearRecoveryTimer = useCallback(() => {
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = null;
  }, []);

  const clearLoading = useCallback(() => {
    loadingRef.current = false;
    setLoading(false);
    setStreamingActive(false);
    clearRecoveryTimer();
  }, [clearRecoveryTimer]);

  const addSystemMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: newId(), role: 'system', text }]);
  }, []);

  const finishRound = useCallback((roundId?: string) => {
    if (roundId) activeRounds.current.delete(roundId);
    if (activeRounds.current.size === 0) {
      clearLoading();
    }
  }, [clearLoading]);

  const finishAllRounds = useCallback(() => {
    activeRounds.current.clear();
    clearLoading();
  }, [clearLoading]);

  const recoverFromState = useCallback(async (showTerminalNotice = true): Promise<boolean> => {
    if (!groupId) return false;
    try {
      const state = await dreamGroupGetState(groupId);
      if (!isTerminalGroupDreamRound(state)) return false;
      const terminalError = terminalGroupDreamRoundError(state);
      finishAllRounds();
      if (showTerminalNotice && terminalError) {
        addSystemMsg(t(terminalError === 'timed_out'
          ? 'groupDream.error.roundTimedOut'
          : 'groupDream.error.roundFailed'));
      }
      return true;
    } catch {
      return false;
    }
  }, [addSystemMsg, finishAllRounds, groupId, t]);

  const scheduleRecovery = useCallback(() => {
    clearRecoveryTimer();
    loadingTimer.current = setTimeout(() => { void recoverFromState(); }, GROUP_DREAM_ROUND_RECOVERY_DELAY_MS);
  }, [clearRecoveryTimer, recoverFromState]);

  const markRoundReplied = useCallback((roundId?: string) => {
    if (roundId) repliedRounds.current.add(roundId);
    else if (activeRounds.current.size === 1) repliedRounds.current.add([...activeRounds.current][0]);
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const belongs = (domain?: string, roundId?: string) => belongsToOpenGroupDream(domain, roundId, activeRounds.current);

    const offStart = wsClient.on('message_stream_start', ({ msg_id, domain, char_id, round_id }) => {
      if (!char_id || !belongs(domain, round_id)) return;
      if (round_id) activeRounds.current.add(round_id);
      markRoundReplied(round_id);
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
      markRoundReplied(round_id);
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
      markRoundReplied(round_id);
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
      loadingRef.current = true;
      setLoading(true);
      scheduleRecovery();
    });
    const offRoundEnd = wsClient.on('group_round_end', ({ group_id, round_id, domain }) => {
      if (!isOpenGroupDreamRound(group_id, groupId, domain)) return;
      const noOneReplied = !repliedRounds.current.has(round_id);
      repliedRounds.current.delete(round_id);
      finishRound(round_id);
      if (noOneReplied) addSystemMsg(t('groupDream.system.noResponse'));
    });
    const offConnection = wsClient.on('state', (state) => {
      if (state === 'connected' && loadingRef.current) void recoverFromState();
    });
    return () => {
      offStart(); offDelta(); offEnd(); offSegments(); offMessage(); offRoundStart(); offRoundEnd(); offConnection();
      clearRecoveryTimer();
      streamIds.current.clear(); streamText.current.clear(); liveStreams.current.clear(); activeRounds.current.clear(); repliedRounds.current.clear();
    };
  }, [addSystemMsg, clearRecoveryTimer, finishRound, groupId, markRoundReplied, recoverFromState, scheduleRecovery, t]);

  const send = useCallback(async (text: string) => {
    if (!groupId) return;
    const trimmed = normalize(text.trim());
    if (!trimmed) return;
    setMessages(prev => [...prev, { id: newId(), role: 'user', text: trimmed }]);
    loadingRef.current = true;
    setLoading(true);
    try {
      const response = await dreamGroupChat(groupId, trimmed);
      activeRounds.current.add(response.round_id);
      scheduleRecovery();
    } catch (error) {
      const status = httpStatus(error);
      if (status === '409') {
        addSystemMsg(t('groupDream.error.conflict'));
        const recovered = await recoverFromState(false);
        if (!recovered) scheduleRecovery();
        return;
      }
      finishAllRounds();
      addSystemMsg(t(status === '422' ? 'groupDream.error.invalidRequest' : 'groupDream.error.sendFailed'));
    }
  }, [addSystemMsg, finishAllRounds, groupId, recoverFromState, scheduleRecovery, t]);

  return { messages, loading, streamingActive, send, addSystemMsg };
}
