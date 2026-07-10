import { useEffect, useState, type CSSProperties } from 'react';
import { getToolLoopSettings, updateToolLoopSettings } from '../../../shared/api/toolLoop';
import type { ToolLoopSettings } from '../../../shared/api/toolLoop';

const MIN_STEPS = 1;
const MAX_STEPS = 8;

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

const rangeRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: 250 };

export function ToolLoopSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ToolLoopSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getToolLoopSettings()
      .then(s => { if (mounted) setSettings(s); })
      .catch(e => { if (mounted) setError(`读取失败：${String(e)}`); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function patch(next: { enabled?: boolean; max_steps?: number }) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateToolLoopSettings(next);
      setSettings(updated);
    } catch (e) {
      setError(`保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="serif" style={{ color: 'var(--ink-3)', fontSize: 13 }}>读取工具循环配置…</div>;
  }
  if (!settings) {
    return (
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--danger)' }}>
        {error ?? '读取失败'}
      </div>
    );
  }

  const blocked = !settings.chat_preset_supports_fc;
  const disabled = blocked || saving;

  return (
    <div style={{ display: 'grid', gap: 18, opacity: blocked ? 0.5 : 1 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>工具自主执行（实验）</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          对应后端 tool_loop 配置；默认关闭，是行为异常时的一键回退口
        </div>
      </div>

      {blocked && (
        <div className="serif" style={{
          padding: '10px 12px', border: '1px dashed var(--paper-edge)',
          borderRadius: 'var(--radius-md)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.6,
        }}>
          当前对话模型不支持工具调用，切换模型预设后可用。
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>让他自主使用工具（多步）</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            开启后回复会变慢、消耗更多 token；出现说话风格异常时关掉这里
          </div>
        </div>
        <Switch
          active={settings.enabled}
          disabled={disabled}
          onClick={() => void patch({ enabled: !settings.enabled })}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>步数上限</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>
            单轮最多调用工具的步数，范围 {MIN_STEPS}–{MAX_STEPS}
          </div>
        </div>
        <div style={rangeRowStyle}>
          <input
            type="range"
            min={MIN_STEPS}
            max={MAX_STEPS}
            step={1}
            value={settings.max_steps}
            disabled={disabled || !settings.enabled}
            onChange={e => void patch({ max_steps: Number(e.target.value) })}
            style={{ flex: 1, minWidth: 0 }}
          />
          <span className="mono" style={{ width: 20, color: 'var(--ink-3)', fontSize: 10, letterSpacing: 0.8 }}>
            {settings.max_steps}
          </span>
        </div>
      </div>

      {error && (
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--danger)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
