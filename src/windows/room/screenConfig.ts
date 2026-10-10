export type ScreenActivity = 'idle' | 'listening' | 'thinking' | 'speaking';
export type ScreenClip =
  | { type: 'image'; uri: string }
  | { type: 'sequence'; frames: { uri: string; durationMs: number }[]; loop: boolean; endBehavior: 'hold' | 'neutral' }
  | { type: 'procedural'; preset: 'thinkingDots' | 'spectrumBars' | 'heartPulse'; base: string; fallback: string };
export interface ScreenConfig {
  schemaVersion: '1.0.0';
  target: { node: string; materialName: string; slot?: number };
  flipY: boolean;
  clips: Record<string, ScreenClip>;
  mappings: { expressions: Record<string, string>; activityStates: Partial<Record<ScreenActivity, string>> };
}
const record = (v: unknown): Record<string, any> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
export const safeScreenPng = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.png$/.test(v);
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export function parseScreenConfig(raw: unknown): ScreenConfig {
  const d = record(raw), t = record(d?.target), c = record(d?.clips), m = record(d?.mappings);
  if (!d || d.schemaVersion !== '1.0.0' || !t || !c || !m) throw new Error('invalid screen schema');
  if (typeof t.node !== 'string' || !t.node || typeof t.materialName !== 'string' || !t.materialName || t.node.length > 128 || t.materialName.length > 128) throw new Error('screen target required');
  if (t.slot !== undefined && (!Number.isInteger(t.slot) || t.slot < 0 || t.slot > 63)) throw new Error('invalid screen slot');
  if (d.flipY !== undefined && typeof d.flipY !== 'boolean') throw new Error('invalid flipY');
  const clips: Record<string, ScreenClip> = {}, resources = new Set<string>();
  const entries = Object.entries(c);
  if (!entries.length || entries.length > 32) throw new Error('screen clip limit');
  for (const [id, value] of entries) {
    const v = record(value);
    if (!ID.test(id) || !v) throw new Error('invalid clip');
    if (v.type === 'image') {
      if (!safeScreenPng(v.uri)) throw new Error('invalid image path');
      resources.add(v.uri); clips[id] = { type: 'image', uri: v.uri };
    } else if (v.type === 'sequence') {
      if (!Array.isArray(v.frames) || !v.frames.length || v.frames.length > 60 || typeof v.loop !== 'boolean' || !['hold', 'neutral'].includes(v.endBehavior)) throw new Error('invalid sequence');
      const frames = v.frames.map((f: any) => {
        if (!record(f) || !safeScreenPng(f.uri) || !Number.isFinite(f.durationMs) || f.durationMs < 40 || f.durationMs > 10000) throw new Error('invalid frame');
        resources.add(f.uri); return { uri: f.uri, durationMs: f.durationMs };
      });
      clips[id] = { type: 'sequence', frames, loop: v.loop, endBehavior: v.endBehavior };
    } else if (v.type === 'procedural') {
      if (!['thinkingDots', 'spectrumBars', 'heartPulse'].includes(v.preset) || typeof v.base !== 'string' || typeof v.fallback !== 'string') throw new Error('unknown procedural preset');
      clips[id] = { type: 'procedural', preset: v.preset, base: v.base, fallback: v.fallback };
    } else throw new Error('unknown screen clip type');
  }
  if (resources.size > 64) throw new Error('screen resource limit');
  for (const v of Object.values(clips)) if (v.type === 'procedural' && (clips[v.base]?.type !== 'image' || clips[v.fallback]?.type !== 'image')) throw new Error('procedural base/fallback must be images');
  const parseMap = (v: unknown, names: readonly string[]) => {
    const r = record(v); if (!r) throw new Error('mapping required');
    const out: Record<string, string> = {};
    for (const [key, id] of Object.entries(r)) {
      if (!names.includes(key) || typeof id !== 'string' || !clips[id]) throw new Error('invalid mapping');
      out[key] = id;
    }
    return out;
  };
  const expressions = parseMap(m.expressions, ['neutral','gentle','thinking','happy','sad','surprised','angry','sleepy','yandere']);
  if (!expressions.neutral || clips[expressions.neutral].type !== 'image') throw new Error('neutral image required');
  return { schemaVersion: '1.0.0', target: { node: t.node, materialName: t.materialName, ...(t.slot === undefined ? {} : { slot: t.slot }) }, flipY: d.flipY ?? false, clips, mappings: { expressions, activityStates: parseMap(m.activityStates, ['idle','listening','thinking','speaking']) } };
}
export function screenResources(config: ScreenConfig): string[] {
  return [...new Set(Object.values(config.clips).flatMap(c => c.type === 'image' ? [c.uri] : c.type === 'sequence' ? c.frames.map(f => f.uri) : []))];
}
export function screenClipId(config: ScreenConfig, expression: string, activity: ScreenActivity): string {
  return config.mappings.activityStates[activity] ?? config.mappings.expressions[expression] ?? config.mappings.expressions.neutral;
}
export function screenFrame(clip: Extract<ScreenClip, { type: 'sequence' }>, elapsed: number): string | null {
  const total = clip.frames.reduce((n, f) => n + f.durationMs, 0);
  let at = Math.max(0, elapsed);
  if (clip.loop) at %= total;
  else if (at >= total) return clip.endBehavior === 'neutral' ? null : clip.frames[clip.frames.length - 1].uri;
  for (const frame of clip.frames) { if (at < frame.durationMs) return frame.uri; at -= frame.durationMs; }
  return clip.frames[clip.frames.length - 1].uri;
}
