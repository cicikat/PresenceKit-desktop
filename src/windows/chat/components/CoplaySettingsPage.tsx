import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { loadCoplayState, armCoplay, disarmCoplay } from '../../../shared/api/backend';
import type { CoplayState, CoplayStatus } from '../../../shared/api/types';

// ─── local styles (kept local to avoid coupling to ChatWindow.tsx internals) ──

const ghostBtn: CSSProperties = {
  padding: '5px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12,
  background: 'var(--paper-2)', border: '1px solid var(--paper-edge)',
  color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'inherit',
};

function Switch({ active, disabled, onClick }: { active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 42, height: 22, borderRadius: 11,
      background: active ? 'var(--accent-3)' : 'var(--paper-3)',
      border: '1px solid var(--paper-edge)',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
      position: 'relative', padding: 0, transition: 'background 0.2s',
    }}>
      <span style={{
        position: 'absolute', top: 1, left: active ? 21 : 1,
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--paper)', boxShadow: '0 1px 3px var(--shadow-rgb-mix)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

const STATUS_LABEL: Record<CoplayStatus, string> = {
  off: '未开启',
  armed: '已开启 · 等待检测到游戏',
  active: '陪玩中',
  closing: '收尾中',
};

const STATUS_COLOR: Record<CoplayStatus, string> = {
  off: 'var(--ink-3)',
  armed: 'var(--accent-3)',
  active: 'var(--accent)',
  closing: 'var(--ink-2)',
};

const POLL_MS = 15000;

export function CoplaySettingsPage() {
  const [state, setState] = useState<CoplayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const s = await loadCoplayState();
      setState(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function handleToggle() {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      if (state.status === 'off') {
        const r = await armCoplay();
        setState(prev => prev ? { ...prev, status: r.status as CoplayStatus } : prev);
      } else {
        const r = await disarmCoplay();
        setState(prev => prev ? { ...prev, status: r.status as CoplayStatus, game_id: null, game_name: null } : prev);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取陪玩模式状态…</div>;
  }

  const status = state?.status ?? 'off';
  const isOn = status !== 'off';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>陪玩模式</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          COPLAY · 检测到游戏进程后角色会在旁观察 + 偶尔评论，不会代替你操作
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>开启陪玩模式</div>
          <div className="mono" style={{ fontSize: 9.5, color: STATUS_COLOR[status], letterSpacing: 1.1, marginTop: 2 }}>
            {STATUS_LABEL[status]}
          </div>
        </div>
        <Switch active={isOn} disabled={busy} onClick={() => void handleToggle()} />
      </div>

      {status === 'active' && state?.game_name && (
        <div className="serif" style={{
          padding: '10px 14px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-md)',
          color: 'var(--ink-2)', fontSize: 12.5,
        }}>
          正在陪你玩：<strong>{state.game_name}</strong>
        </div>
      )}

      {error && (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--danger)' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button style={ghostBtn} disabled={busy} onClick={() => void refresh()}>刷新状态</button>
      </div>

      <div className="serif" style={{
        padding: '12px 14px', border: '1px dashed var(--paper-edge)',
        borderRadius: 'var(--radius-md)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.7,
      }}>
        开启后处于「等待检测」状态；实际检测到游戏进程（Steam 或后端配置的白名单进程）才会真正进入「陪玩中」，
        由后端 watcher 每 60 秒轮询一次判定，不是本开关直接控制。游戏退出后自动进入收尾并回到「等待检测」，
        持续开着也不会一直陪玩到底——关闭需要显式点这个开关。
      </div>
    </div>
  );
}
