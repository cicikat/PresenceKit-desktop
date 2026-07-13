import { useEffect, useState } from 'react';
import { getDesktopTtsEnabled, setDesktopTtsEnabled } from '../../../shared/api/runtimeSettings';

export function DesktopTtsSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDesktopTtsEnabled().then(setEnabled).catch(e => setError(String(e))).finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try { await setDesktopTtsEnabled(next); }
    catch (e) { setEnabled(!next); setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>桌面语音条</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            开启后助手消息显示语音条；首次点击时才合成，不自动消耗
          </div>
        </div>
        <button onClick={() => void toggle()} disabled={loading || saving} style={{
          width: 42, height: 22, borderRadius: 11, padding: 0, position: 'relative', cursor: 'pointer',
          background: enabled ? 'var(--accent-3)' : 'var(--paper-3)', border: '1px solid var(--paper-edge)',
        }}>
          <span style={{ position: 'absolute', top: 1, left: enabled ? 21 : 1, width: 18, height: 18, borderRadius: '50%', background: 'var(--paper)', transition: 'left .2s' }} />
        </button>
      </div>
      {error && <div className="mono" style={{ fontSize: 10, color: 'var(--danger)' }}>保存失败：{error}</div>}
    </div>
  );
}
