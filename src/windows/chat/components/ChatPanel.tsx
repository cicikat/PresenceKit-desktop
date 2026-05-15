/* ============================================================
 * ChatPanel — 聊天窗口
 * 迁移自: Emerald-desktopUI/chat.jsx
 *
 * Phase-1 变更:
 *   - 删除 pickReply() / pickDraft() / showMeta() (mock 回复逻辑)
 *   - send() 只把用户消息加到本地列表，不触发任何 AI 回复
 *   - 保留呼吸动画 (requestAnimationFrame)
 *   - 保留 wantToSpeak → typing 指示器
 * TODO: Phase-3 WebSocket — send() 里加后端调用
 * ============================================================ */

import { useState, useEffect, useRef } from 'react';
import { Tag, Icon, Btn } from './UIKit';
import { MOOD_HUE, MOOD_LABEL_EN, ACTIVITY_LABEL_EN } from './UIKit';
import { MOOD_TABLE } from '../../../shared/state/store';
import { sendChat } from '../../../shared/api/backend';
import { wsClient } from '../../../shared/api/ws';

function ChatAvatar({ hue, size = 40, scale = 1 }: any) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}
      style={{ transform: `scale(${scale})`, transition: 'transform 0.12s ease-out' }}>
      <defs>
        <radialGradient id={`cv-${Math.floor(hue)}-${size}`} cx="42%" cy="38%">
          <stop offset="0%" stopColor={`oklch(0.95 0.04 ${hue})`} />
          <stop offset="100%" stopColor={`oklch(0.75 0.07 ${hue})`} />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#cv-${Math.floor(hue)}-${size})`} stroke={`oklch(0.50 0.06 ${hue} / 0.3)`} strokeWidth="0.8" />
      <circle cx="14.5" cy="19" r="2.2" fill={`oklch(0.22 0.05 ${hue})`} />
      <circle cx="25.5" cy="19" r="2.2" fill={`oklch(0.22 0.05 ${hue})`} />
      <path d="M 15 26 q 5 3 10 0" stroke={`oklch(0.30 0.05 ${hue})`} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Bubble({ msg, currentHue, breath }: any) {
  const fromUser = msg.role === 'user';
  const hue = msg.moodHue ?? currentHue;
  const time = msg.time ? new Date(msg.time).toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' }) : '';

  if (fromUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0' }}>
        <div style={{ maxWidth: '78%' }}>
          <div className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--ink-3)', textAlign: 'right', marginBottom: 4 }}>
            YOU · {time}
          </div>
          <div style={{
            padding: '10px 14px',
            background: 'var(--ink)', color: 'var(--paper)',
            borderRadius: '6px 6px 1px 6px',
            fontSize: 13.5, lineHeight: 1.55,
            boxShadow: '0 4px 12px oklch(0.30 0.04 60 / 0.18)',
          }}>{msg.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start' }}>
      <div style={{ paddingTop: 14 }}>
        <ChatAvatar hue={hue} size={36} scale={breath} />
      </div>
      <div style={{ flex: 1, maxWidth: 'calc(100% - 60px)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: 1.4, color: 'var(--ink-3)' }}>HER · {time}</span>
          {msg.moodLabel && <Tag hue={hue}>{msg.moodLabel}</Tag>}
        </div>
        <div style={{
          padding: '11px 15px',
          background: 'var(--paper-2)',
          borderLeft: `3px solid oklch(0.55 0.13 ${hue})`,
          borderTop: '1px solid var(--paper-edge)',
          borderRight: '1px solid var(--paper-edge)',
          borderBottom: '1px solid var(--paper-edge)',
          borderRadius: '2px 6px 6px 2px',
          fontSize: 14, lineHeight: 1.65, color: 'var(--ink)',
          fontFamily: 'var(--font-serif)',
        }}>
          {msg.deleted && (
            <div style={{ textDecoration: 'line-through', opacity: 0.45, fontSize: 12.5, marginBottom: 4 }}>{msg.deleted}</div>
          )}
          {msg.text}
          {msg.meta && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 6, letterSpacing: 0.8 }}>{msg.meta}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DayDivider({ label }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 6px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1.5 }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--paper-edge)' }} />
    </div>
  );
}

const SEED_MESSAGES = [
  { role: 'assistant', text: '在啊。', moodHue: MOOD_HUE['平静'], moodLabel: MOOD_LABEL_EN['平静'], time: Date.now() - 1000 * 60 * 60 * 3 },
  { role: 'user',      text: '今天加班，好累。', time: Date.now() - 1000 * 60 * 60 * 3 + 60_000 },
  { role: 'assistant', text: '嗯…那把椅子转向我一下。', moodHue: MOOD_HUE['平静'], moodLabel: MOOD_LABEL_EN['平静'], time: Date.now() - 1000 * 60 * 60 * 3 + 120_000 },
  { role: 'user',      text: '为什么？', time: Date.now() - 1000 * 60 * 60 * 2 },
  { role: 'assistant', text: '这样我能看见你写字。\n手腕别那么用力。', moodHue: MOOD_HUE['平静'], moodLabel: MOOD_LABEL_EN['平静'], time: Date.now() - 1000 * 60 * 60 * 2 + 30_000 },
  { role: 'user',      text: '你今天心情还好吗。', time: Date.now() - 60_000 },
  { role: 'assistant', text: '看见你回来就好。', moodHue: MOOD_HUE['开心'], moodLabel: MOOD_LABEL_EN['开心'], time: Date.now() - 30_000 },
];

export function ChatPanel({ engine, chatRectRef, headerVisible = true }: any) {
  const [state, setState] = useState(engine.get());
  useEffect(() => engine.subscribe(setState), [engine]);

  const [messages, setMessages] = useState(SEED_MESSAGES);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const rootRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* 注册聊天区位置 */
  useEffect(() => {
    const update = () => {
      if (rootRef.current && chatRectRef) chatRectRef.current = rootRef.current.getBoundingClientRect();
    };
    update();
    window.addEventListener('resize', update);
    const h = setInterval(update, 1000);
    return () => { window.removeEventListener('resize', update); clearInterval(h); };
  }, []);

  /* 头像呼吸动画 */
  const [breathe, setBreathe] = useState(1);
  useEffect(() => {
    let raf: number;
    const loop = (t: number) => {
      const m = engine.get().mood;
      const cfg = MOOD_TABLE[m];
      setBreathe(1 + Math.sin(t / cfg.breathePeriod * Math.PI * 2) * cfg.breatheDepth * 0.7);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  /* 自动滚到底 */
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, typing]);

  /* wantToSpeak → typing 闪现 */
  useEffect(() => {
    if (state.wantToSpeak) {
      setTyping(true);
      const t = setTimeout(() => setTyping(false), 2800);
      return () => clearTimeout(t);
    }
  }, [state.wantToSpeak]);

  /* WS 连接 + channel_message 订阅 */
  useEffect(() => {
    wsClient.connect('ws://127.0.0.1:8080/ws/desktop');
    return wsClient.on('channel_message', (content) => {
      const m = engine.get();
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: content,
        moodHue: MOOD_HUE[m.mood],
        moodLabel: MOOD_LABEL_EN[m.mood],
        time: Date.now(),
      }]);
    });
  }, [engine]);

  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onInputChange = (v: string) => {
    setInput(v);
    engine.markInteraction();
    if (state.activity !== '看你打字') engine.applyStateUpdate({ activity: '看你打字' });
    if (inputTimer.current) clearTimeout(inputTimer.current);
    inputTimer.current = setTimeout(() => engine.applyStateUpdate({ activity: '看你' }), 2500);
  };

  const send = async () => {
    const t = input.trim();
    if (!t || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: t, time: Date.now() }]);
    engine.applyStateUpdate({ activity: '想事情' });
    setLoading(true);
    try {
      const { reply } = await sendChat(t);
      const m = engine.get();
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: reply,
        moodHue: MOOD_HUE[m.mood],
        moodLabel: MOOD_LABEL_EN[m.mood],
        time: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'system',
        text: `（连接失败：${err.message}）`,
        time: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const currentHue = MOOD_HUE[state.mood];

  return (
    <div ref={rootRef} style={{
      position: 'relative', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: 'var(--paper)', overflow: 'hidden',
    }}>
      {/* HEADER */}
      {headerVisible && (
        <div style={{
          padding: '20px 28px 14px', borderBottom: '1px solid var(--paper-edge)',
          background: 'var(--paper)', display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <ChatAvatar hue={currentHue} size={50} scale={breathe} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ margin: 0, fontSize: 28, fontWeight: 600, color: 'var(--ink)', letterSpacing: -0.4 }}>
                对话
              </h1>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: 1.3 }}>
                CHAPTER · {new Date().toLocaleDateString('zh', { month: 'long', day: 'numeric' }).toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tag hue={currentHue}>{MOOD_LABEL_EN[state.mood]}</Tag>
              <Tag variant="outline">{ACTIVITY_LABEL_EN[state.activity] || state.activity.toUpperCase()}</Tag>
              <Tag variant="outline" hue={state.presence === 'active' ? 145 : state.presence === 'idle' ? 80 : 30}>
                {state.presence.toUpperCase()}
              </Tag>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <Btn icon="settings" dense>偏好</Btn>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 1.4 }}>
              {messages.length} ENTRIES
            </span>
          </div>
        </div>
      )}

      {/* MESSAGES */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 28px 12px', background: 'var(--paper)' }}>
        <DayDivider label="EARLIER" />
        {messages.map((m: any, i: number) => <Bubble key={i} msg={m} currentHue={currentHue} breath={breathe} />)}
        {(typing || loading) && (
          <div style={{ display: 'flex', gap: 10, padding: '8px 0', alignItems: 'flex-start' }}>
            <div style={{ paddingTop: 6 }}><ChatAvatar hue={currentHue} size={36} scale={breathe} /></div>
            <div style={{
              padding: '12px 16px', borderRadius: '2px 6px 6px 2px',
              background: 'var(--paper-2)',
              borderLeft: `3px solid oklch(0.55 0.13 ${currentHue})`,
              borderTop: '1px solid var(--paper-edge)',
              borderRight: '1px solid var(--paper-edge)',
              borderBottom: '1px solid var(--paper-edge)',
            }}>
              <span className="typing-dots"><i /><i /><i /></span>
            </div>
          </div>
        )}
        <style>{`
          .typing-dots i { display:inline-block; width:5px; height:5px; border-radius:50%;
            background:var(--ink-3); margin:0 2px;
            animation:dot 1.2s ease-in-out infinite; }
          .typing-dots i:nth-child(2){ animation-delay:0.18s }
          .typing-dots i:nth-child(3){ animation-delay:0.36s }
          @keyframes dot { 0%,100%{ opacity:0.3; transform:translateY(0) } 50%{ opacity:1; transform:translateY(-3px) } }
        `}</style>
      </div>

      {/* INPUT */}
      <div style={{ position: 'relative', padding: 18, borderTop: '1px solid var(--paper-edge)', background: 'var(--paper-2)' }}>
        {showAttachMenu && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 18, marginBottom: 8,
            background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 6,
            padding: 6, minWidth: 200,
            boxShadow: '0 12px 32px oklch(0.30 0.04 60 / 0.20)', zIndex: 10,
          }}>
            {([
              ['attach', '附加文件',   '.pdf .png .jpg'],
              ['book',   '插入日记片段', '从她的日记中'],
              ['leaf',   '从花园中取',  '已养成的物品'],
              ['sparkle','设置心情',   '手动注入状态'],
            ] as [string, string, string][]).map(([icon, label, sub]) => (
              <button key={label} onClick={() => setShowAttachMenu(false)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--ink)', textAlign: 'left', borderRadius: 4, fontFamily: 'inherit',
              }}
                onMouseEnter={e => (e.currentTarget as any).style.background = 'var(--paper-3)'}
                onMouseLeave={e => (e.currentTarget as any).style.background = 'transparent'}>
                <Icon name={icon} size={16} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 0.8 }}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <button onClick={() => setShowAttachMenu(s => !s)} style={{
            width: 40, height: 40, borderRadius: 6,
            background: showAttachMenu ? 'var(--ink)' : 'var(--paper)',
            color: showAttachMenu ? 'var(--paper)' : 'var(--ink)',
            border: '1px solid var(--paper-edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <Icon name="plus" size={18} />
          </button>
          <textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="写点什么…"
            rows={1}
            style={{
              flex: 1, resize: 'none', padding: '11px 14px', borderRadius: 6,
              background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-serif)',
              outline: 'none', minHeight: 40, maxHeight: 120, lineHeight: 1.5,
            }}
          />
          <button onClick={send} style={{
            height: 40, padding: '0 18px', borderRadius: 6,
            background: 'var(--accent)', color: 'var(--paper)',
            border: 'none', fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5,
          }}>
            <Icon name="send" size={15} /> 寄出
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)', letterSpacing: 1.2 }}>
            ENTER 发送 · SHIFT+ENTER 换行
          </span>
          {state.wantToSpeak && (
            <span className="mono" style={{ fontSize: 9.5, color: `oklch(0.45 0.12 ${currentHue})`, letterSpacing: 1.2 }}>
              · 她想说什么…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
