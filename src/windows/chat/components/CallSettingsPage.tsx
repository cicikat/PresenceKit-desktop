import { useState, useEffect, type CSSProperties } from 'react';
import {
  loadRoomSettings,
  saveRoomSettings,
  DEFAULT_ROOM_SETTINGS,
  subscribeRoomSettings,
  getCharacterCfg,
} from '../../../shared/room/roomSettings';
import type { RoomSettings, Framing, LightCfg, RoomLights, RoomProp } from '../../../shared/room/roomSettings';
import { listRoomCharacters, listRoomScenes, listRoomPropCategories, listRoomPropFiles } from '../../../shared/room/roomAssets';
import type { RoomAsset, RoomPropCategory, RoomPropFile } from '../../../shared/room/roomAssets';
import {
  loadRoomPresets,
  createPreset,
  deletePreset,
} from '../../../shared/room/roomPresets';
import type { RoomPreset } from '../../../shared/room/roomPresets';
import type { RenderMode } from '../../../shared/room/roomSettings';
import { Live2DSettingsSection } from './Live2DSettingsSection';

// ─── shared styles ────────────────────────────────────────────────────────────

const selectStyle: CSSProperties = {
  width: '100%', padding: '6px 9px',
  border: '1px solid var(--paper-edge)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--paper-2)', color: 'var(--ink-2)',
  fontFamily: 'inherit', fontSize: 11,
};

const btnStyle: CSSProperties = {
  padding: '5px 12px', borderRadius: 'var(--radius-sm)',
  fontSize: 11, background: 'var(--paper-2)',
  border: '1px solid var(--paper-edge)', color: 'var(--ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
};

const dangerBtnStyle: CSSProperties = { ...btnStyle, color: 'var(--danger)', borderColor: 'var(--danger)' };

// mirrors springBones.ts DEFAULT_SPRING_PARAMS.gravity — kept local to avoid a cross-window import
const DEFAULT_PHYS_GRAVITY = 0.3;

// ─── primitives ───────────────────────────────────────────────────────────────

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function SectionHeader({ label, hint, open, onToggle }: {
  label: string; hint?: string; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        all: 'unset', display: 'flex', width: '100%', alignItems: 'center',
        gap: 8, cursor: 'pointer',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
        {hint && <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>{hint}</div>}
      </div>
      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{open ? '▲' : '▼'}</span>
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function CallSettingsPage() {
  const [settings, setSettings] = useState<RoomSettings>(loadRoomSettings);
  const [chars, setChars] = useState<RoomAsset[]>([]);
  const [scenes, setScenes] = useState<RoomAsset[]>([]);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [presets, setPresets] = useState<RoomPreset[]>(loadRoomPresets);
  const [newPresetName, setNewPresetName] = useState('');
  const [lightsOpen, setLightsOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [propCategories, setPropCategories] = useState<RoomPropCategory[]>([]);
  const [propCategory, setPropCategory] = useState('');
  const [propFiles, setPropFiles] = useState<RoomPropFile[]>([]);

  // stay in sync with changes from other sources (e.g. RoomWindow save-view)
  useEffect(() => {
    return subscribeRoomSettings(setSettings);
  }, []);

  useEffect(() => {
    Promise.all([listRoomCharacters(), listRoomScenes()])
      .then(([c, s]) => { setChars(c); setScenes(s); setAssetsError(null); })
      .catch(e => setAssetsError(String(e)));
  }, []);

  useEffect(() => {
    if (!propsOpen) return;
    listRoomPropCategories().then(setPropCategories).catch(() => {});
  }, [propsOpen]);

  useEffect(() => {
    if (!propsOpen) return;
    listRoomPropFiles(propCategory).then(setPropFiles).catch(() => setPropFiles([]));
  }, [propsOpen, propCategory]);

  function patch(partial: Partial<RoomSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveRoomSettings(next);
  }

  function patchOffset(idx: 0 | 1 | 2, v: number) {
    const next: [number, number, number] = [...settings.offset] as [number, number, number];
    next[idx] = v;
    patch({ offset: next });
  }

  function patchLights(partial: Partial<RoomLights>) {
    patch({ lights: { ...settings.lights, ...partial } });
  }

  function patchLightCfg(key: 'ambient' | 'key' | 'charFill', partial: Partial<LightCfg>) {
    patchLights({ [key]: { ...settings.lights[key], ...partial } });
  }

  function patchLightPos(key: 'key' | 'charFill', idx: 0 | 1 | 2, v: number) {
    const pos = [...(settings.lights[key].pos ?? [0, 0, 0])] as [number, number, number];
    pos[idx] = v;
    patchLightCfg(key, { pos });
  }

  function patchPhysicsGravity(v: number) {
    const file = settings.characterFile;
    const charCfg = getCharacterCfg(settings, file);
    patch({
      perCharacter: {
        ...settings.perCharacter,
        [file]: {
          ...charCfg,
          physicsBones: { ...charCfg.physicsBones, default: { ...charCfg.physicsBones?.default, gravity: v } },
        },
      },
    });
  }

  function handleReset() {
    setSettings(DEFAULT_ROOM_SETTINGS);
    saveRoomSettings(DEFAULT_ROOM_SETTINGS);
  }

  function handleCreatePreset() {
    if (!newPresetName.trim()) return;
    setPresets(createPreset(newPresetName.trim(), settings));
    setNewPresetName('');
  }

  function handleApplyPreset(preset: RoomPreset) {
    setSettings(preset.settings);
    saveRoomSettings(preset.settings);
  }

  function handleDeletePreset(id: string) {
    setPresets(deletePreset(id));
  }

  const FRAMING_OPTIONS: { value: Framing; label: string }[] = [
    { value: 'face', label: '露脸' },
    { value: 'upperBody', label: '半身' },
    { value: 'full', label: '全身' },
  ];

  const colorInputStyle: CSSProperties = {
    width: 32, height: 24, padding: 0, border: '1px solid var(--paper-edge)',
    borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer',
  };

  const checkStyle: CSSProperties = { width: 14, height: 14, cursor: 'pointer' };

  const renderMode: RenderMode = settings.renderMode ?? 'model3d';

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Row label="渲染模式" hint="3D 模型 · Live2D，即时切换">
        <select
          value={renderMode}
          onChange={e => patch({ renderMode: e.target.value as RenderMode })}
          style={{ ...selectStyle, width: 120 }}
        >
          <option value="model3d">3D 模型</option>
          <option value="live2d">Live2D</option>
        </select>
      </Row>

      {renderMode === 'live2d' && <Live2DSettingsSection />}

      {renderMode === 'model3d' && <>

      <Divider />

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>模型与场景</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          扫描 public/room/ 下的 glb 文件，选择后即时替换
        </div>
      </div>

      {assetsError && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--danger)', letterSpacing: 0.8 }}>
          扫描失败：{assetsError}
        </div>
      )}

      <Row label="角色模型" hint="public/room/character/ 下的 glb">
        <select
          value={settings.characterFile}
          onChange={e => patch({ characterFile: e.target.value })}
          style={{ ...selectStyle, width: 170 }}
        >
          {chars.length === 0 && <option value={settings.characterFile}>{settings.characterFile}</option>}
          {chars.map(a => <option key={a.fileName} value={a.fileName}>{a.label}</option>)}
        </select>
      </Row>

      <Row label="场景模型" hint="public/room/scene/ 下的 glb">
        <select
          value={settings.sceneFile}
          onChange={e => patch({ sceneFile: e.target.value })}
          style={{ ...selectStyle, width: 170 }}
        >
          {scenes.length === 0 && <option value={settings.sceneFile}>{settings.sceneFile}</option>}
          {scenes.map(a => <option key={a.fileName} value={a.fileName}>{a.label}</option>)}
        </select>
      </Row>

      <Divider />

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>构图参数</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          {settings.customView ? '当前使用保存的自定义视角（优先于构图模式）' : '按构图模式自动摆放相机'}
        </div>
      </div>

      <Row label="构图" hint="控制镜头裁切范围">
        <select
          value={settings.framing}
          onChange={e => patch({ framing: e.target.value as Framing })}
          style={{ ...selectStyle, width: 100 }}
        >
          {FRAMING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>

      <Row label="焦距" hint="20–80°，小值广角（透视感强），大值长焦（更上镜）">
        <SliderNum min={20} max={80} step={1} value={settings.fovDeg ?? 45} onChange={v => patch({ fovDeg: v })} unit="°" />
      </Row>

      <Row label="锚定方式" hint="自由：按包围盒中心悬浮（适合半身）；贴地：底边踩 y=0">
        <select
          value={settings.anchorMode}
          onChange={e => patch({ anchorMode: e.target.value as 'floor' | 'free' })}
          style={{ ...selectStyle, width: 100 }}
        >
          <option value="free">自由</option>
          <option value="floor">贴地</option>
        </select>
      </Row>

      <Row label="缩放微调" hint="0.2–3，乘以归一化缩放">
        <SliderNum min={0.2} max={3} step={0.01} value={settings.scaleMul} onChange={v => patch({ scaleMul: v })} />
      </Row>

      <Row label="X 偏移" hint="水平位移（-2–2）">
        <SliderNum min={-2} max={2} step={0.01} value={settings.offset[0]} onChange={v => patchOffset(0, v)} />
      </Row>
      <Row label="Y 偏移" hint="垂直位移（-2–2）">
        <SliderNum min={-2} max={2} step={0.01} value={settings.offset[1]} onChange={v => patchOffset(1, v)} />
      </Row>
      <Row label="Z 偏移" hint="前后位移（-2–2）">
        <SliderNum min={-2} max={2} step={0.01} value={settings.offset[2]} onChange={v => patchOffset(2, v)} />
      </Row>

      <Row label="朝向" hint="角色 Y 轴旋转（-180–180°）">
        <SliderNum min={-180} max={180} step={1} value={settings.yawDeg} onChange={v => patch({ yawDeg: v })} unit="°" />
      </Row>

      {settings.customView && (
        <Row label="自定义视角" hint="由视频通话窗口「保存当前视角」写入">
          <button style={dangerBtnStyle} onClick={() => patch({ customView: null })}>清除</button>
        </Row>
      )}

      <Row label="重置所有" hint="恢复默认构图参数">
        <button style={btnStyle} onClick={handleReset}>重置</button>
      </Row>

      <Divider />

      {/* ── Lights section ── */}
      <SectionHeader
        label="灯光"
        hint="三盏灯 · 场景灯开关 · 情绪调色"
        open={lightsOpen}
        onToggle={() => setLightsOpen(o => !o)}
      />

      {lightsOpen && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Row label="保留场景自带灯" hint="关闭时剥离 glb 内置灯（避免叠加突兀）">
            <input
              type="checkbox" style={checkStyle}
              checked={settings.lights.useSceneLights}
              onChange={e => patchLights({ useSceneLights: e.target.checked })}
            />
          </Row>
          <Row label="情绪调色" hint="开启后主光随情绪轻微变色">
            <input
              type="checkbox" style={checkStyle}
              checked={settings.lights.moodTint}
              onChange={e => patchLights({ moodTint: e.target.checked })}
            />
          </Row>

          <Divider />

          {/* ambient */}
          <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--paper-edge)' }}>
            <Row label="环境光" hint="全场补光，无方向">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" style={checkStyle}
                  checked={settings.lights.ambient.on}
                  onChange={e => patchLightCfg('ambient', { on: e.target.checked })}
                />
                <input type="color" style={colorInputStyle}
                  value={settings.lights.ambient.color}
                  onChange={e => patchLightCfg('ambient', { color: e.target.value })}
                />
              </div>
            </Row>
            <Row label="强度" hint="0–4">
              <SliderNum min={0} max={4} step={0.05} value={settings.lights.ambient.intensity}
                onChange={v => patchLightCfg('ambient', { intensity: v })} />
            </Row>
          </div>

          <Divider />

          {/* key light */}
          <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--paper-edge)' }}>
            <Row label="主光" hint="有方向，照亮全场">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" style={checkStyle}
                  checked={settings.lights.key.on}
                  onChange={e => patchLightCfg('key', { on: e.target.checked })}
                />
                <input type="color" style={colorInputStyle}
                  value={settings.lights.key.color}
                  onChange={e => patchLightCfg('key', { color: e.target.value })}
                />
              </div>
            </Row>
            <Row label="强度" hint="0–4">
              <SliderNum min={0} max={4} step={0.05} value={settings.lights.key.intensity}
                onChange={v => patchLightCfg('key', { intensity: v })} />
            </Row>
            <Row label="位置 X" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.key.pos?.[0] ?? 2}
                onChange={v => patchLightPos('key', 0, v)} />
            </Row>
            <Row label="位置 Y" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.key.pos?.[1] ?? 4}
                onChange={v => patchLightPos('key', 1, v)} />
            </Row>
            <Row label="位置 Z" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.key.pos?.[2] ?? 3}
                onChange={v => patchLightPos('key', 2, v)} />
            </Row>
          </div>

          <Divider />

          {/* charFill */}
          <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--paper-edge)' }}>
            <Row label="角色补光" hint="只照角色、不影响房间">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" style={checkStyle}
                  checked={settings.lights.charFill.on}
                  onChange={e => patchLightCfg('charFill', { on: e.target.checked })}
                />
                <input type="color" style={colorInputStyle}
                  value={settings.lights.charFill.color}
                  onChange={e => patchLightCfg('charFill', { color: e.target.value })}
                />
              </div>
            </Row>
            <Row label="强度" hint="0–4">
              <SliderNum min={0} max={4} step={0.05} value={settings.lights.charFill.intensity}
                onChange={v => patchLightCfg('charFill', { intensity: v })} />
            </Row>
            <Row label="位置 X" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.charFill.pos?.[0] ?? 0.5}
                onChange={v => patchLightPos('charFill', 0, v)} />
            </Row>
            <Row label="位置 Y" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.charFill.pos?.[1] ?? 1.6}
                onChange={v => patchLightPos('charFill', 1, v)} />
            </Row>
            <Row label="位置 Z" hint="-8–8">
              <SliderNum min={-8} max={8} step={0.1} value={settings.lights.charFill.pos?.[2] ?? 2}
                onChange={v => patchLightPos('charFill', 2, v)} />
            </Row>
          </div>
        </div>
      )}

      <Divider />

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>物理骨骼</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          头发/尾巴等弹簧物理链的整体强度（模型需绑骨并打 phys_chain 属性，否则无效果）
        </div>
      </div>

      <Row label="物理强度" hint="整体重力/摆动强度；0 完全关闭该物理（按角色模型文件分别记忆）">
        <SliderNum
          min={0} max={1} step={0.05}
          value={getCharacterCfg(settings, settings.characterFile).physicsBones?.default?.gravity ?? DEFAULT_PHYS_GRAVITY}
          onChange={patchPhysicsGravity}
        />
      </Row>

      <Divider />

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>预设</div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: 1.1 }}>
          保存当前所有参数为命名预设，随时一键应用
        </div>
      </div>

      {presets.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {presets.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                style={{ ...btnStyle, flex: 1, textAlign: 'left' }}
                onClick={() => handleApplyPreset(p)}
              >
                {p.name}
              </button>
              <button style={dangerBtnStyle} onClick={() => handleDeletePreset(p.id)}>删除</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="新预设名称"
          value={newPresetName}
          onChange={e => setNewPresetName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreatePreset(); }}
          style={{
            flex: 1, padding: '5px 8px', fontSize: 11,
            border: '1px solid var(--paper-edge)', borderRadius: 'var(--radius-sm)',
            background: 'var(--paper-2)', color: 'var(--ink-2)', fontFamily: 'inherit',
          }}
        />
        <button style={btnStyle} onClick={handleCreatePreset}>保存当前</button>
      </div>

      <Divider />

      {/* ── Props section ── */}
      <SectionHeader
        label="道具"
        hint="public/room/props/ 下的 glb，用🛠摆放模式拖动定位"
        open={propsOpen}
        onToggle={() => setPropsOpen(o => !o)}
      />

      {propsOpen && (
        <div style={{ display: 'grid', gap: 10 }}>
          <Row label="类别" hint="props/ 子目录（空=根目录）">
            <select
              value={propCategory}
              onChange={e => setPropCategory(e.target.value)}
              style={{ ...selectStyle, width: 130 }}
            >
              <option value="">（根目录）</option>
              {propCategories.map(c => (
                <option key={c.category} value={c.category}>{c.category}</option>
              ))}
            </select>
          </Row>

          {propFiles.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {propFiles.map(f => (
                <div key={f.file} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>
                  <button
                    style={btnStyle}
                    onClick={() => {
                      const newProp: RoomProp = { file: f.file, pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 };
                      patch({ props: [...(settings.props ?? []), newProp] });
                    }}
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}

          {(settings.props ?? []).length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1 }}>
                已放置
              </div>
              {(settings.props ?? []).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.file}
                  </span>
                  <button
                    style={dangerBtnStyle}
                    onClick={() => patch({ props: (settings.props ?? []).filter((_, j) => j !== i) })}
                  >
                    删除
                  </button>
                </div>
              ))}
            </>
          )}

          {propFiles.length === 0 && (settings.props ?? []).length === 0 && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 0.8 }}>
              public/room/props/ 下无 glb
            </div>
          )}
        </div>
      )}

      <Divider />

      <div className="serif" style={{
        padding: '12px 14px', border: '1px dashed var(--paper-edge)',
        borderRadius: 'var(--radius-md)', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.7,
      }}>
        在视频通话窗口底部点击「🔧 调整视角」可自由旋转/缩放/平移查看模型，摆好后点「保存当前视角」固定机位。点击「🛠 摆放」可拖动角色/灯光/道具定位。
      </div>

      </>}
    </div>
  );
}
