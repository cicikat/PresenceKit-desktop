import { useEffect, useState } from 'react';
import { getModelRouting, setModelRouting, type ModelRoutingSettings } from '../../../shared/api/runtimeSettings';

const selectStyle = {
  width: 220, padding: '6px 9px', border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)', background: 'var(--paper-2)', color: 'var(--ink-2)',
  fontFamily: 'inherit', fontSize: 11,
} as const;

export function ModelRoutingSettingsPage() {
  const [data, setData] = useState<ModelRoutingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getModelRouting().then(setData).catch(error => setStatus(`读取失败：${String(error)}`));
  }, []);

  const select = async (name: string) => {
    if (!data || saving) return;
    const previous = data.active_routing;
    setData({ ...data, active_routing: name });
    setSaving(true);
    setStatus(null);
    try {
      await setModelRouting(name);
      setStatus('模型方案已切换，新回复立即使用');
    } catch (error) {
      setData({ ...data, active_routing: previous });
      setStatus(`切换失败：${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const active = data?.profiles.find(item => item.name === data.active_routing);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>对话模型方案</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          API Key 与模型地址仍由管理面维护；这里仅切换已验证方案
        </div>
      </div>
      {data ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select value={data.active_routing} disabled={saving || data.is_legacy_synth}
            onChange={event => void select(event.target.value)} style={selectStyle}>
            {data.profiles.map(profile => (
              <option key={profile.name} value={profile.name}>{profile.name} · {profile.model || profile.chat_preset}</option>
            ))}
          </select>
          {active && <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{active.provider_kind} / {active.tool_call_mode}</span>}
        </div>
      ) : <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 12 }}>读取模型方案…</div>}
      {data?.is_legacy_synth && (
        <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 12 }}>当前仍是 legacy 配置，请先在管理面“模型路由”点一次初始化。</div>
      )}
      {status && <div className="mono" style={{ fontSize: 10, color: status.startsWith('切换失败') || status.startsWith('读取失败') ? 'var(--danger)' : 'var(--ink-3)' }}>{status}</div>}
    </div>
  );
}
