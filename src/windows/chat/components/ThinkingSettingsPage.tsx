import { useEffect, useState, type CSSProperties } from 'react';
import { getThinkingSettings, updateThinkingSettings } from '../../../shared/api/thinking';
import type { ThinkingMode, ThinkingSettings } from '../../../shared/api/thinking';

function Switch({ active, onClick, disabled }: { active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 42, height: 22, borderRadius: 11,
      background: active ? 'var(--accent-3)' : 'var(--paper-3)',
      border: '1px solid var(--paper-edge)',
      cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative', padding: 0,
      transition: 'background 0.2s', opacity: disabled ? 0.6 : 1,
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

const selectStyle: CSSProperties = {
  width: 140, padding: '6px 9px',
  border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink-2)',
  fontFamily: 'inherit', fontSize: 11,
};

const MODE_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'native', label: '原生思考' },
  { value: 'monologue', label: '前置独白' },
];

export function ThinkingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ThinkingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getThinkingSettings()
      .then(s => { if (mounted) setSettings(s); })
      .catch(e => { if (mounted) setError(`读取失败：${String(e)}`); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function patch(next: { enabled?: boolean; mode?: ThinkingMode; apply_to_proactive?: boolean }) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateThinkingSettings(next);
      setSettings(updated);
    } catch (e) {
      setError(`保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取思考配置…</div>;
  }
  if (!settings) {
    return (
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--danger)' }}>
        {error ?? '读取失败'}
      </div>
    );
  }

  const disabled = saving;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>回复前先思考（实验）</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          回复会变慢一点，但更贴合语境；觉得不对劲随时关
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>回复前先思考</div>
        </div>
        <Switch
          active={settings.enabled}
          disabled={disabled}
          onClick={() => void patch({ enabled: !settings.enabled })}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: settings.enabled ? 1 : 0.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>模式</div>
          {settings.mode === 'auto' && (
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
              当前模型将使用：{settings.chat_preset_reasoning_native ? '原生思考' : '前置独白'}
            </div>
          )}
        </div>
        <select
          value={settings.mode}
          disabled={disabled || !settings.enabled}
          onChange={e => void patch({ mode: e.target.value as ThinkingMode })}
          style={selectStyle}
        >
          {MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: settings.enabled ? 1 : 0.5 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>主动消息也思考</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            默认关闭；开启后主动消息也会消耗额外思考 token
          </div>
        </div>
        <Switch
          active={settings.apply_to_proactive}
          disabled={disabled || !settings.enabled}
          onClick={() => void patch({ apply_to_proactive: !settings.apply_to_proactive })}
        />
      </div>

      {error && (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
