/* ============================================================
 * ToySidebar — 玩耍模式侧栏
 *   两块只读状态卡：
 *     1) 系统状态（Intiface / 蓝牙连接） + 连接/重连按钮
 *     2) toy 状态（已发现设备列表）
 *   每 6s 轮询 GET /hardware/devices；不写设备控制。
 * ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { getHardwareDevices, connectHardware } from '../../../shared/api/hardware';
import type { HardwareStatus } from '../../../shared/api/types';

const POLL_MS = 6000;

const cardStyle: CSSProperties = {
  background: 'var(--paper-2)',
  border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-md, 8px)',
  padding: '14px 16px',
  display: 'grid',
  gap: 10,
};

function Dot({ on }: { on: boolean }) {
  return (
    <span style={{
      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
      background: on ? 'var(--status-ok, oklch(0.72 0.16 150))' : 'var(--status-error, oklch(0.65 0.2 25))',
      boxShadow: on ? '0 0 6px var(--status-ok, oklch(0.72 0.16 150))' : 'none',
    }} />
  );
}

export function ToySidebar() {
  const [status, setStatus] = useState<HardwareStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getHardwareDevices();
      if (!mounted.current) return;
      setStatus(next);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, [refresh]);

  const onConnect = async () => {
    setConnecting(true);
    try {
      await connectHardware();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      if (mounted.current) setConnecting(false);
    }
  };

  const connected = status?.connected ?? false;
  const devices = status?.devices ?? [];

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      padding: '16px 14px', display: 'grid', gap: 14, alignContent: 'start',
      background: 'var(--paper)',
    }}>
      {/* 系统状态 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot on={connected} />
          <span className="serif" style={{ fontSize: 14, fontWeight: 600 }}>系统状态</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: 1.2 }}>SYSTEM</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          Intiface 蓝牙连接：{connected ? '已连接' : '未连接'}
        </div>
        <button
          onClick={onConnect}
          disabled={connecting}
          style={{
            justifySelf: 'start',
            padding: '6px 14px', fontSize: 12, fontFamily: 'inherit',
            border: '1px solid var(--paper-edge)', borderRadius: 6,
            background: 'var(--paper)', color: 'var(--ink)',
            cursor: connecting ? 'default' : 'pointer', opacity: connecting ? 0.6 : 1,
          }}>
          {connecting ? '连接中…' : connected ? '重新扫描' : '连接 Intiface'}
        </button>
        {error && (
          <div style={{ fontSize: 11.5, color: 'var(--status-error, oklch(0.65 0.2 25))', lineHeight: 1.5 }}>
            读取失败：{error}
          </div>
        )}
      </div>

      {/* toy 状态 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot on={devices.length > 0} />
          <span className="serif" style={{ fontSize: 14, fontWeight: 600 }}>toy 状态</span>
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: 1.2 }}>DEVICES</span>
        </div>
        {devices.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            {connected ? '未发现设备，确认设备已开机并在 Intiface 中配对。' : '先连接 Intiface 再扫描设备。'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {devices.map(d => (
              <div key={d.index} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 6,
                background: 'var(--paper)', border: '1px solid var(--paper-edge)',
              }}>
                <Dot on={d.connected} />
                <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.display_name || d.name}
                </span>
                {d.can_vibrate && (
                  <span className="mono" style={{
                    fontSize: 9, letterSpacing: 1, color: 'var(--forest)',
                    background: 'var(--on-forest)', padding: '2px 6px', borderRadius: 4,
                  }}>振动</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="serif" style={{
        padding: '12px 14px', border: '1px dashed var(--paper-edge)', borderRadius: 'var(--radius-md, 8px)',
        color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.7,
      }}>
        设备控制由叶瑄在对话里按你的话触发，这里只显示状态。
      </div>
    </div>
  );
}
