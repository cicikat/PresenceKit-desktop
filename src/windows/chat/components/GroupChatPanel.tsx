/* ============================================================
 * GroupChatPanel — 多角色群聊面板 (spec-10 §4)
 * 复用 ChatPanel 的流式引擎范式（streamingLocalIdRef / streamingTextRef /
 * replaceStreamingBubbleWithParts），差异仅在 speakerId 维度。
 * ============================================================ */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { getClientConfig } from '../../../shared/api/config';
import { wsClient } from '../../../shared/api/ws';
import { notifyOnMessage } from '../../../shared/api/notify';
import { getGroup, groupSend, getCharacterAvatar, getPromptAssets, patchGroupRoster, patchGroupSettings } from '../../../shared/api/backend';
import { TypingDots } from '../../../shared/ui/TypingDots';
import { normalizeChatDisplayText } from '../chatDisplay';
import { chatThemeFontSize } from '../../../shared/chatAppearance';
import type { GroupDetail, PromptAssetCharacter } from '../../../shared/api/types';

// ── Helpers (mirrors ChatPanel) ───────────────────────────────────────────────

function splitReply(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
}

let _idCounter = 0;
function newId() { return `gc-${Date.now()}-${++_idCounter}`; }

function setBoundedMapEntry<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  time: number;
  speakerId?: string; // char_id; absent = owner (right bubble)
  wsMsgId?: string;
  isStreaming?: boolean;
  streamingDone?: boolean;
}

interface RosterEntry {
  label: string;
  avatarDataUrl: string | null;
}

// ── Streaming content renderer ────────────────────────────────────────────────

function renderStreamingContent(text: string, isDone: boolean) {
  if (!text) return isDone ? null : <TypingDots color="var(--ink-3)" />;
  return (
    <>
      {text}
      {!isDone && (
        <span style={{ opacity: 0.6, animation: 'streaming-cursor-blink 0.8s step-end infinite' }}>▌</span>
      )}
    </>
  );
}

// ── Avatar placeholder ────────────────────────────────────────────────────────

function CharAvatar({ entry, size = 32 }: { entry: RosterEntry | undefined; size?: number }) {
  if (entry?.avatarDataUrl) {
    return (
      <img
        src={entry.avatarDataUrl}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const initial = (entry?.label ?? '?')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'oklch(0.85 0.07 210)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.44, fontWeight: 600,
      color: 'oklch(0.28 0.09 210)',
      fontFamily: 'var(--font-serif)',
    }}>
      {initial}
    </div>
  );
}

// ── Group Settings Panel ──────────────────────────────────────────────────────

function GroupSettingsPanel({
  groupId,
  detail,
  onClose,
  onSaved,
}: {
  groupId: string;
  detail: GroupDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [characters, setCharacters] = useState<PromptAssetCharacter[]>([]);
  const [charsLoading, setCharsLoading] = useState(true);
  const [roster, setRoster] = useState<string[]>(() => detail.roster.map(m => m.char_id));
  const [minR, setMinR] = useState(detail.settings.min_responders);
  const [maxR, setMaxR] = useState(detail.settings.max_responders);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPromptAssets().then(a => setCharacters(a.characters)).catch(() => setCharacters([])).finally(() => setCharsLoading(false));
  }, []);

  const toggleMember = (id: string) =>
    setRoster(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const effectiveMax = Math.min(Math.max(minR, maxR), Math.max(1, roster.length));
  const rosterLimit = Math.min(Math.max(1, roster.length), 6);

  const handleSave = async () => {
    if (roster.length < 1) { setError('至少保留 1 位成员'); return; }
    setSaving(true);
    setError(null);
    try {
      const origRoster = detail.roster.map(m => m.char_id);
      const rosterChanged = JSON.stringify([...roster].sort()) !== JSON.stringify([...origRoster].sort());
      const settingsChanged = minR !== detail.settings.min_responders || effectiveMax !== detail.settings.max_responders;

      if (rosterChanged) await patchGroupRoster(groupId, roster);
      if (settingsChanged) await patchGroupSettings(groupId, { min_responders: minR, max_responders: effectiveMax });

      onSaved();
    } catch (err) {
      setError(`保存失败：${String(err)}`);
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      background: 'var(--paper)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--paper-edge)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--paper-2)', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', fontSize: 20, padding: '0 4px', lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}
        >‹</button>
        <div className="serif" style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>群设置</div>
        <div className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-3)', letterSpacing: 1.3 }}>GROUP SETTINGS</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gap: 20, alignContent: 'start' }}>
        {/* Member management */}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>成员管理</div>
          <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 1.1, marginBottom: 10 }}>
            已选 {roster.length} 位 · 至少保留 1 位
          </div>
          {charsLoading ? (
            <div className="mono" style={{ color: 'var(--ink-4)', fontSize: 11, letterSpacing: 1.2 }}>正在读取角色列表…</div>
          ) : characters.length === 0 ? (
            <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13, fontStyle: 'italic' }}>暂无可用角色</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {characters.map(c => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${roster.includes(c.id) ? 'oklch(0.55 0.13 210)' : 'var(--paper-edge)'}`,
                    background: roster.includes(c.id) ? 'oklch(0.95 0.04 210 / 0.4)' : 'var(--paper-2)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={roster.includes(c.id)}
                    onChange={() => toggleMember(c.id)}
                    style={{ accentColor: 'oklch(0.55 0.13 210)', width: 14, height: 14 }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', fontFamily: 'var(--font-serif)' }}>{c.label}</span>
                  <span className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-4)', letterSpacing: 0.8 }}>{c.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* N/M sliders */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>回应人数</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>
              N 最少 <span className="mono" style={{ fontWeight: 700, color: 'oklch(0.50 0.13 210)' }}>{minR}</span>
            </div>
            <input
              type="range" min={1} max={rosterLimit} value={minR}
              onChange={e => { const v = Number(e.target.value); setMinR(v); if (maxR < v) setMaxR(v); }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>
              M 最多 <span className="mono" style={{ fontWeight: 700, color: 'oklch(0.50 0.13 210)' }}>{effectiveMax}</span>
            </div>
            <input
              type="range" min={minR} max={rosterLimit} value={effectiveMax}
              onChange={e => setMaxR(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div className="mono" style={{ fontSize: chatThemeFontSize(9.5), color: 'var(--ink-3)', letterSpacing: 0.8 }}>
            每轮 {minR}–{effectiveMax} 位成员回应
          </div>
        </div>

        {error && (
          <div className="mono" style={{ color: 'var(--danger)', fontSize: chatThemeFontSize(10), letterSpacing: 0.8 }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px', borderTop: '1px solid var(--paper-edge)',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
        background: 'var(--paper-2)', flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          disabled={saving}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--paper-edge)',
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
            opacity: saving ? 0.5 : 1, background: 'var(--paper-2)', color: 'var(--ink-2)',
          }}
        >取消</button>
        <button
          onClick={() => void handleSave()}
          disabled={saving || roster.length === 0}
          style={{
            padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid transparent',
            cursor: (saving || roster.length === 0) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
            opacity: (saving || roster.length === 0) ? 0.5 : 1,
            background: 'var(--ink)', color: 'var(--paper)',
          }}
        >{saving ? '保存中…' : '保存'}</button>
      </div>
    </div>
  );
}

// ── Bubble ────────────────────────────────────────────────────────────────────

const GroupBubble = memo(function GroupBubble({
  msg, showLabel, rosterEntry, fontSize,
}: {
  msg: ChatMsg;
  showLabel: boolean;
  rosterEntry: RosterEntry | undefined;
  fontSize: number;
}) {
  if (msg.role === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-4)', letterSpacing: 0.8 }}>
          {msg.text}
        </span>
      </div>
    );
  }

  const isOwner = !msg.speakerId;

  if (isOwner) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 0' }}>
        <div style={{
          maxWidth: '76%', padding: '9px 13px',
          background: 'var(--ink)', color: 'var(--paper)',
          borderRadius: '6px 6px 1px 6px',
          fontSize, lineHeight: 1.55, whiteSpace: 'pre-wrap',
          boxShadow: '0 2px 8px oklch(0.25 0.04 60 / 0.14)',
        }}>
          {normalizeChatDisplayText(msg.text)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', alignItems: 'flex-start' }}>
      <div style={{ paddingTop: showLabel ? 20 : 4, flexShrink: 0 }}>
        <CharAvatar entry={rosterEntry} size={32} />
      </div>
      <div style={{ flex: 1, maxWidth: 'calc(100% - 48px)' }}>
        {showLabel && (
          <div className="mono" style={{
            fontSize: chatThemeFontSize(9), color: 'var(--ink-3)',
            letterSpacing: 1.2, marginBottom: 3,
          }}>
            {(rosterEntry?.label ?? msg.speakerId!).toUpperCase()}
          </div>
        )}
        <div style={{
          display: 'inline-block', maxWidth: '100%',
          padding: '9px 13px',
          background: 'var(--paper-2)',
          borderLeft: '3px solid oklch(0.55 0.13 210)',
          border: '1px solid var(--paper-edge)',
          borderRadius: '2px 6px 6px 2px',
          fontSize, lineHeight: 1.60, color: 'var(--ink)',
          fontFamily: 'var(--font-serif)', whiteSpace: 'pre-wrap',
        }}>
          {msg.isStreaming
            ? renderStreamingContent(msg.text, msg.streamingDone ?? false)
            : normalizeChatDisplayText(msg.text)
          }
        </div>
      </div>
    </div>
  );
});

// ── GroupChatPanel ────────────────────────────────────────────────────────────

export function GroupChatPanel({
  groupId, onBack, fontSize = 14,
}: {
  groupId: string;
  onBack: () => void;
  fontSize?: number;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [roundLocked, setRoundLocked] = useState(false);
  const [roundStatus, setRoundStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [rosterMap, setRosterMap] = useState<Record<string, RosterEntry>>({});
  const [showSettings, setShowSettings] = useState(false);

  // Streaming refs — same pattern as ChatPanel
  const streamingLocalIdRef = useRef<Map<string, string[]>>(new Map());
  const streamingTextRef    = useRef<Map<string, string>>(new Map());
  const wsMsgIdMapRef       = useRef<Map<string, string[]>>(new Map());
  const scrollRef           = useRef<HTMLDivElement>(null);
  const roundTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inject streaming keyframes (same guard as ChatPanel)
  useEffect(() => {
    const id = 'emerald-streaming-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes streaming-cursor-blink { 0%,100%{opacity:.6} 50%{opacity:.15} }
    `;
    document.head.appendChild(style);
  }, []);

  // Load group detail + roster on mount
  useEffect(() => {
    let mounted = true;
    async function init() {
      // Ensure WS is connected (idempotent)
      try {
        const cfg = await getClientConfig();
        if (mounted) wsClient.connect(cfg.websocketBase);
      } catch { /* ignore */ }

      try {
        const d = await getGroup(groupId);
        if (!mounted) return;
        setDetail(d);

        // Build initial roster map (no avatars yet)
        const initial: Record<string, RosterEntry> = {};
        for (const m of d.roster) initial[m.char_id] = { label: m.label, avatarDataUrl: null };
        setRosterMap(initial);

        // Convert recent transcript to ChatMsg[]
        const msgs: ChatMsg[] = [];
        for (const gm of d.recent) {
          const parts = splitReply(gm.content);
          const textParts = parts.length > 0 ? parts : [gm.content];
          if (gm.speaker_id === 'owner') {
            textParts.forEach(text => msgs.push({ id: newId(), role: 'user', text, time: gm.timestamp * 1000 }));
          } else {
            textParts.forEach(text => msgs.push({ id: newId(), role: 'assistant', text, time: gm.timestamp * 1000, speakerId: gm.speaker_id }));
          }
        }
        setMessages(msgs);

        // Load avatars async — update rosterMap per-char as they arrive
        for (const m of d.roster) {
          if (m.avatar_url) {
            getCharacterAvatar(m.char_id).then(dataUrl => {
              if (!mounted || !dataUrl) return;
              setRosterMap(prev => ({ ...prev, [m.char_id]: { ...prev[m.char_id], avatarDataUrl: dataUrl } }));
            }).catch(() => {});
          }
        }
      } catch (err) {
        if (mounted) {
          setMessages([{ id: newId(), role: 'system', text: `加载群聊失败：${String(err)}`, time: Date.now() }]);
        }
      }
    }
    void init();
    return () => { mounted = false; };
  }, [groupId]);

  // Auto-scroll when messages append
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLenRef.current && scrollRef.current) {
      const s = scrollRef.current;
      if (s.scrollHeight - s.scrollTop - s.clientHeight < 180 || prevLenRef.current === 0) {
        s.scrollTop = s.scrollHeight;
      }
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  // Replace in-flight streaming bubbles with canonical split content (spec-10 §4.1)
  const replaceStreamingBubbleWithParts = useCallback((msgId: string, content: string) => {
    const liveIds = streamingLocalIdRef.current.get(msgId) ?? [];
    if (liveIds.length === 0) return;
    streamingLocalIdRef.current.delete(msgId);
    streamingTextRef.current.delete(msgId);

    const parts = splitReply(content);
    if (parts.length === 0) {
      setMessages(prev => prev.filter(m => !liveIds.includes(m.id)));
      return;
    }
    const localIds = parts.map((_, i) => liveIds[i] ?? newId());
    setBoundedMapEntry(wsMsgIdMapRef.current, msgId, localIds, 200);

    setMessages(prev => {
      const anchorIdx = prev.findIndex(m => m.id === liveIds[0]);
      if (anchorIdx === -1) return prev;
      const base = prev[anchorIdx];
      const liveById = new Map(prev.filter(m => liveIds.includes(m.id)).map(m => [m.id, m] as const));
      // ...base spread preserves speakerId automatically
      const rebuilt: ChatMsg[] = parts.map((text, i) => ({
        ...(liveById.get(localIds[i]) ?? base),
        id: localIds[i],
        text,
        isStreaming: false,
        streamingDone: false,
        wsMsgId: i === 0 ? msgId : undefined,
      }));
      const withoutLive = prev.filter(m => !liveIds.includes(m.id));
      const insertAt = prev.slice(0, anchorIdx).filter(m => !liveIds.includes(m.id)).length;
      return [...withoutLive.slice(0, insertAt), ...rebuilt, ...withoutLive.slice(insertAt)];
    });
  }, []);

  // WS subscriptions
  useEffect(() => {
    const clearRoundTimer = () => {
      if (roundTimerRef.current !== null) { clearTimeout(roundTimerRef.current); roundTimerRef.current = null; }
    };

    // channel_message: only group messages have char_id; skip dream and 1v1
    const unsubMsg = wsClient.on('channel_message', ({ content, msg_id, source, char_id }) => {
      if (source === 'dream') return;
      if (!char_id) return; // 1v1 has no char_id → skip
      if (wsMsgIdMapRef.current.has(msg_id)) return; // dedup

      if (streamingLocalIdRef.current.has(msg_id)) {
        replaceStreamingBubbleWithParts(msg_id, content);
        return;
      }
      // Non-streaming path: append assistant bubbles with speakerId
      const parts = splitReply(content);
      if (parts.length === 0) return;
      const ids = parts.map(() => newId());
      setBoundedMapEntry(wsMsgIdMapRef.current, msg_id, ids, 200);
      setMessages(prev => [...prev, ...parts.map((text, i) => ({
        id: ids[i], role: 'assistant' as const, text,
        time: Date.now(),
        wsMsgId: i === 0 ? msg_id : undefined,
        speakerId: char_id,
      }))]);
      void notifyOnMessage(msg_id, char_id, content);
    });

    // stream_start{char_id} → create streaming bubble with speakerId
    const unsubStreamStart = wsClient.on('message_stream_start', ({ msg_id, char_id }) => {
      if (!char_id) return;
      const firstId = newId();
      streamingLocalIdRef.current.set(msg_id, [firstId]);
      streamingTextRef.current.set(msg_id, '');
      setMessages(prev => [...prev, {
        id: firstId, role: 'assistant' as const,
        text: '', time: Date.now(),
        wsMsgId: msg_id, speakerId: char_id,
        isStreaming: true, streamingDone: false,
      }]);
    });

    // stream_delta: accumulate text, split by \n+, update live bubbles
    const unsubStreamDelta = wsClient.on('message_stream_delta', ({ msg_id, delta }) => {
      const ids = streamingLocalIdRef.current.get(msg_id);
      if (!ids) return;
      const acc = (streamingTextRef.current.get(msg_id) ?? '') + delta;
      streamingTextRef.current.set(msg_id, acc);
      const parts = splitReply(acc);
      const effParts = parts.length === 0 ? [''] : parts;
      while (ids.length < effParts.length) ids.push(newId());
      streamingLocalIdRef.current.set(msg_id, ids);
      const lastIdx = effParts.length - 1;
      setMessages(prev => {
        const present = new Set(prev.map(x => x.id));
        let next = prev.map(item => {
          const i = ids.indexOf(item.id);
          if (i === -1 || i >= effParts.length) return item;
          return { ...item, text: effParts[i], isStreaming: true, streamingDone: i !== lastIdx };
        });
        const missing = ids.slice(0, effParts.length).filter(id => !present.has(id));
        if (missing.length) {
          const base = prev.find(m => m.id === ids[0]);
          const lastPresent = [...ids.slice(0, effParts.length)].reverse().find(id => present.has(id));
          const insertAt = lastPresent ? next.findIndex(x => x.id === lastPresent) + 1 : next.length;
          const added: ChatMsg[] = missing.map(id => {
            const i = ids.indexOf(id);
            return { id, role: 'assistant' as const, text: effParts[i], time: Date.now(), speakerId: base?.speakerId, isStreaming: true, streamingDone: i !== lastIdx };
          });
          next = [...next.slice(0, insertAt), ...added, ...next.slice(insertAt)];
        }
        return next;
      });
    });

    // stream_end: close cursors; canonical channel_message will replace bubbles
    const unsubStreamEnd = wsClient.on('message_stream_end', ({ msg_id }) => {
      const ids = streamingLocalIdRef.current.get(msg_id);
      if (!ids) return;
      setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, streamingDone: true } : m));
      void notifyOnMessage(msg_id, '叶瑄', streamingTextRef.current.get(msg_id) ?? '');
    });

    // group_round_start → lock input; timeout fallback 30s
    const unsubRoundStart = wsClient.on('group_round_start', ({ group_id }) => {
      if (group_id !== groupId) return;
      clearRoundTimer();
      setRoundLocked(true);
      setRoundStatus('成员陆续回应中…');
      roundTimerRef.current = setTimeout(() => {
        setRoundLocked(false);
        setRoundStatus('');
      }, 30_000);
    });

    // group_round_end → unlock input
    const unsubRoundEnd = wsClient.on('group_round_end', ({ group_id }) => {
      if (group_id !== groupId) return;
      clearRoundTimer();
      setRoundLocked(false);
      setRoundStatus('');
    });

    return () => {
      unsubMsg(); unsubStreamStart(); unsubStreamDelta(); unsubStreamEnd();
      unsubRoundStart(); unsubRoundEnd();
      clearRoundTimer();
    };
  }, [groupId, replaceStreamingBubbleWithParts]);

  // Send message
  const send = async () => {
    const t = input.trim();
    if (!t || sending || roundLocked) return;
    setInput('');
    setMessages(prev => [...prev, { id: newId(), role: 'user', text: t, time: Date.now() }]);
    setSending(true);
    try {
      await groupSend(groupId, t);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'system',
        text: `发送失败：${String(err)}`, time: Date.now(),
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleSettingsSaved = useCallback(async () => {
    setShowSettings(false);
    try {
      const d = await getGroup(groupId);
      setDetail(d);
      const newMap: Record<string, RosterEntry> = {};
      for (const m of d.roster) newMap[m.char_id] = { label: m.label, avatarDataUrl: null };
      setRosterMap(newMap);
      for (const m of d.roster) {
        if (m.avatar_url) {
          getCharacterAvatar(m.char_id).then(dataUrl => {
            if (dataUrl) setRosterMap(prev => ({ ...prev, [m.char_id]: { ...prev[m.char_id], avatarDataUrl: dataUrl } }));
          }).catch(() => {});
        }
      }
    } catch { /* ignore — detail stays as-is */ }
  }, [groupId]);

  // Compute which assistant bubbles show speaker label (only on speaker change)
  const showLabelSet = new Set<string>();
  {
    let prevSpeakerId: string | undefined = '__sentinel__';
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'user') { prevSpeakerId = '__sentinel__'; continue; }
      if (m.speakerId !== prevSpeakerId) {
        showLabelSet.add(m.id);
        prevSpeakerId = m.speakerId;
      }
    }
  }

  const title = detail?.title ?? groupId;
  const rosterLine = detail
    ? detail.roster.map(r => r.label).join(' · ') + ` · N${detail.settings.min_responders}/M${detail.settings.max_responders}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--paper)', position: 'relative' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--paper-edge)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--paper-2)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          title="返回群列表"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ink-3)', fontSize: 20, padding: '0 4px', lineHeight: 1,
            display: 'flex', alignItems: 'center',
          }}
        >‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="serif" style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          {rosterLine && (
            <div className="mono" style={{ fontSize: chatThemeFontSize(9), color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 1 }}>
              {rosterLine}
            </div>
          )}
        </div>
        {/* Roster avatars preview */}
        {detail && (
          <div style={{ display: 'flex', gap: -4 }}>
            {detail.roster.slice(0, 5).map(m => (
              <div key={m.char_id} style={{ marginLeft: -6 }}>
                <CharAvatar entry={rosterMap[m.char_id]} size={24} />
              </div>
            ))}
          </div>
        )}
        {/* Settings gear */}
        {detail && (
          <button
            onClick={() => setShowSettings(true)}
            title="群设置"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--ink-3)', fontSize: 16, padding: '0 4px', lineHeight: 1,
              display: 'flex', alignItems: 'center',
            }}
          >⚙</button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 1,
        }}
      >
        {messages.length === 0 && !detail && (
          <div className="mono" style={{ textAlign: 'center', color: 'var(--ink-4)', marginTop: 40, fontSize: 11, letterSpacing: 1.2 }}>
            正在加载…
          </div>
        )}
        {messages.length === 0 && detail && (
          <div className="serif" style={{ textAlign: 'center', color: 'var(--ink-3)', marginTop: 40, fontSize: 13, fontStyle: 'italic' }}>
            发送消息，开始群聊
          </div>
        )}
        {messages.map(msg => (
          <GroupBubble
            key={msg.id}
            msg={msg}
            showLabel={showLabelSet.has(msg.id) && msg.role === 'assistant'}
            rosterEntry={msg.speakerId ? rosterMap[msg.speakerId] : undefined}
            fontSize={fontSize}
          />
        ))}
      </div>

      {/* Round status banner */}
      {roundLocked && roundStatus && (
        <div style={{
          padding: '5px 16px',
          background: 'var(--paper-3)',
          borderTop: '1px solid var(--paper-edge)',
          textAlign: 'center', flexShrink: 0,
        }}>
          <span className="mono" style={{ fontSize: chatThemeFontSize(10), color: 'var(--ink-3)', letterSpacing: 1.2 }}>
            {roundStatus}
          </span>
        </div>
      )}

      {/* Input */}
      <div style={{
        borderTop: '1px solid var(--paper-edge)',
        padding: '10px 14px',
        display: 'flex', gap: 8,
        background: 'var(--paper-2)', flexShrink: 0,
      }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          disabled={roundLocked || sending}
          placeholder={roundLocked ? roundStatus || '回应中…' : '发送消息…'}
          style={{
            flex: 1, padding: '8px 12px',
            background: 'var(--paper)', border: '1px solid var(--paper-edge)',
            borderRadius: 'var(--radius-md)', color: 'var(--ink)', fontFamily: 'inherit',
            fontSize, outline: 'none', transition: 'opacity 0.15s',
            opacity: roundLocked ? 0.55 : 1,
          }}
        />
        <button
          onClick={() => void send()}
          disabled={roundLocked || sending || !input.trim()}
          style={{
            padding: '8px 18px', borderRadius: 'var(--radius-md)',
            background: 'var(--ink)', color: 'var(--paper)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 500,
            opacity: (roundLocked || sending || !input.trim()) ? 0.45 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {sending ? '…' : '发送'}
        </button>
      </div>

      {/* Group settings overlay */}
      {showSettings && detail && (
        <GroupSettingsPanel
          groupId={groupId}
          detail={detail}
          onClose={() => setShowSettings(false)}
          onSaved={() => void handleSettingsSaved()}
        />
      )}
    </div>
  );
}
