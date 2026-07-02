import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  loadLive2DSettings,
  saveLive2DSettings,
  subscribeLive2DSettings,
  type Live2DSettings,
  type Live2DBgKind,
} from '../../../shared/live2d/live2dSettings';
import { listLive2DModels } from '../../../shared/live2d/live2dAssets';
import type { Live2DModelAsset } from '../../../shared/live2d/live2dAssets';

// Local copies of CallSettingsPage's Row/SliderNum/Divider/selectStyle primitives — importing
// them directly would create a circular dependency (CallSettingsPage renders this section).
const selectStyle: CSSProperties = {
  width: '100%', padding: '6px 9px',
  border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink-2)',
  fontFamily: 'inherit', fontSize: 11,
};

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SliderNum({
  min, max, step, value, onChange, unit,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; unit?: string;
}) {
  const numStyle: CSSProperties = {
    width: 58, padding: '4px 6px', fontSize: 11,
    border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
    background: 'var(--paper-2)', color: 'var(--ink-2)',
    fontFamily: 'var(--font-mono, monospace)', textAlign: 'right',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 240 }}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1, minWidth: 0 }}
      />
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        style={numStyle}
      />
      {unit && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', width: 18 }}>{unit}</span>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--paper-edge)' }} />;
}

const textInputStyle: CSSProperties = {
  width: 170, padding: '5px 8px', fontSize: 11,
  border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink-2)', fontFamily: 'inherit',
};

const colorInputStyle: CSSProperties = {
  width: 32, height: 24, padding: 0, border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer',
};

const BG_OPTIONS: { value: Live2DBgKind; label: string }[] = [
  { value: 'transparent', label: '跟随窗口' },
  { value: 'color', label: '纯色' },
  { value: 'image', label: '图片' },
];

export function Live2DSettingsSection() {
  const [settings, setSettings] = useState<Live2DSettings>(loadLive2DSettings);
  const [models, setModels] = useState<Live2DModelAsset[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => subscribeLive2DSettings(setSettings), []);

  useEffect(() => {
    listLive2DModels()
      .then(list => { setModels(list); setModelsError(null); })
      .catch(e => setModelsError(String(e)));
  }, []);

  function patch(partial: Partial<Live2DSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveLive2DSettings(next);
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>Live2D 模型</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          扫描 public/live2d/models/ 下的模型目录，选择后即时替换
        </div>
      </div>

      {modelsError && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 0.8 }}>
          扫描失败：{modelsError}
        </div>
      )}

      <Row label="模型" hint="public/live2d/models/<模型名>/ 下的 *.model3.json">
        {models.length === 0 ? (
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.8, maxWidth: 220, textAlign: 'right' }}>
            未找到模型，放到 public/live2d/models/&lt;名&gt;/ 后刷新
          </div>
        ) : (
          <select
            value={settings.modelDir}
            onChange={e => patch({ modelDir: e.target.value })}
            style={{ ...selectStyle, width: 170 }}
          >
            <option value="">（未选择）</option>
            {models.map(m => <option key={m.dirName} value={m.dirName}>{m.label}</option>)}
          </select>
        )}
      </Row>

      <Row label="缩放" hint="0.2–3">
        <SliderNum min={0.2} max={3} step={0.01} value={settings.scaleMul} onChange={v => patch({ scaleMul: v })} />
      </Row>

      <Row label="X 偏移" hint="画布宽度比例，-1–1">
        <SliderNum
          min={-1} max={1} step={0.01} value={settings.offset[0]}
          onChange={v => patch({ offset: [v, settings.offset[1]] })}
        />
      </Row>
      <Row label="Y 偏移" hint="画布高度比例，-1–1">
        <SliderNum
          min={-1} max={1} step={0.01} value={settings.offset[1]}
          onChange={v => patch({ offset: [settings.offset[0], v] })}
        />
      </Row>

      <Divider />

      <Row label="背景" hint="跟随窗口=透明">
        <select
          value={settings.bgKind}
          onChange={e => patch({ bgKind: e.target.value as Live2DBgKind })}
          style={{ ...selectStyle, width: 100 }}
        >
          {BG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      {settings.bgKind === 'color' && (
        <Row label="背景色">
          <input
            type="color" style={colorInputStyle}
            value={settings.bgColor}
            onChange={e => patch({ bgColor: e.target.value })}
          />
        </Row>
      )}

      {settings.bgKind === 'image' && (
        <Row label="背景图路径" hint="public 下的相对路径，如 /live2d/backgrounds/xx.jpg">
          <input
            type="text"
            value={settings.bgImage ?? ''}
            onChange={e => patch({ bgImage: e.target.value || null })}
            placeholder="/live2d/backgrounds/xx.jpg"
            style={textInputStyle}
          />
        </Row>
      )}

      <Divider />

      <Row label="口型强度" hint="0–1">
        <SliderNum min={0} max={1} step={0.01} value={settings.lipsyncStrength} onChange={v => patch({ lipsyncStrength: v })} />
      </Row>

      <Row label="待机动作组" hint="Cubism 默认约定为 Idle">
        <input
          type="text"
          value={settings.idleMotionGroup}
          onChange={e => patch({ idleMotionGroup: e.target.value || 'Idle' })}
          style={textInputStyle}
        />
      </Row>

      <Row label="口型参数名" hint="模型参数名不标准时改这里">
        <input
          type="text"
          value={settings.mouthParam}
          onChange={e => patch({ mouthParam: e.target.value || 'ParamMouthOpenY' })}
          style={textInputStyle}
        />
      </Row>
    </div>
  );
}
