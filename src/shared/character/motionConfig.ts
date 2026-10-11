/** CA-05 motions.json contract: describes how an imported clip is played. Data only; clips live in GLB files. */
export const MOTION_MASKS = ['full', 'upper', 'arms'] as const;
export type MotionMask = typeof MOTION_MASKS[number];
export const ROOT_MOTION_MODES = ['inPlace', 'keep'] as const;
export type RootMotionMode = typeof ROOT_MOTION_MODES[number];
/** Who drives head/eyes while the motion plays: the performer keeps them, or the motion owns them. */
export const HEAD_EYE_POLICIES = ['performer', 'clip'] as const;
export type HeadEyePolicy = typeof HEAD_EYE_POLICIES[number];

export interface MotionDescriptor {
  id: string;
  /** Clip name inside the motion GLB (or the character GLB when `file` is omitted). */
  clip: string;
  /** Sibling GLB file name holding the clip; omit to use the character's own animations. */
  file?: string;
  loop: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  mask: MotionMask;
  /** Higher wins when two motions want the same bones. */
  priority: number;
  rootMotion: RootMotionMode;
  headEye: HeadEyePolicy;
  /** Names the source skeleton convention, for diagnostics only. */
  sourceRig?: string;
}

export interface MotionsConfig { schemaVersion: string; motions: MotionDescriptor[] }
export type MotionsResult =
  | { ok: true; config: MotionsConfig; warnings: string[] }
  | { ok: false; errors: string[] };

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const ID = /^[A-Za-z0-9._-]{1,48}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.glb$/;
const KNOWN = ['id', 'clip', 'file', 'loop', 'fadeInMs', 'fadeOutMs', 'mask', 'priority', 'rootMotion', 'headEye', 'sourceRig'];

export function parseMotionsConfig(raw: unknown): MotionsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = asRecord(raw);
  if (!data) return { ok: false, errors: ['motions must be an object'] };
  if (typeof data.schemaVersion !== 'string' || !/^1\.\d+\.\d+$/.test(data.schemaVersion)) errors.push('unsupported schemaVersion');
  if (!Array.isArray(data.motions)) errors.push('motions must be an array');
  else if (data.motions.length > 128) errors.push('motions exceeds 128 entries');
  const motions: MotionDescriptor[] = [];
  const ids = new Set<string>();
  const list = Array.isArray(data.motions) ? data.motions.slice(0, 128) : [];
  list.forEach((item, i) => {
    const where = `motions[${i}]`;
    const m = asRecord(item);
    if (!m) { errors.push(`${where}: must be an object`); return; }
    if (typeof m.id !== 'string' || !ID.test(m.id)) { errors.push(`${where}: invalid id`); return; }
    if (ids.has(m.id)) { errors.push(`${where}: duplicate id ${m.id}`); return; }
    ids.add(m.id);
    if (typeof m.clip !== 'string' || !m.clip) { errors.push(`${where}: clip required`); return; }
    if (m.file !== undefined && (typeof m.file !== 'string' || !FILE.test(m.file))) {
      errors.push(`${where}: file must be a .glb name beside the model`);
      return;
    }
    const ms = (key: string, def: number): number => {
      const v = m[key] === undefined ? def : m[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 5000) { errors.push(`${where}: ${key} must be 0-5000`); return def; }
      return v;
    };
    const pick = <T extends string>(key: string, allowed: readonly T[], def: T): T => {
      const v = m[key] === undefined ? def : m[key];
      if (!(allowed as readonly unknown[]).includes(v)) { errors.push(`${where}: ${key} must be one of ${allowed.join('/')}`); return def; }
      return v as T;
    };
    const priority = m.priority === undefined ? 0 : m.priority;
    if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < -100 || priority > 100) {
      errors.push(`${where}: priority must be an integer in [-100, 100]`);
    }
    for (const k of Object.keys(m)) if (!KNOWN.includes(k)) warnings.push(`${where}: ignored unknown field ${k}`);
    motions.push({
      id: m.id, clip: m.clip, file: m.file as string | undefined,
      loop: m.loop === true, fadeInMs: ms('fadeInMs', 200), fadeOutMs: ms('fadeOutMs', 200),
      mask: pick('mask', MOTION_MASKS, 'full'), priority: typeof priority === 'number' ? priority : 0,
      rootMotion: pick('rootMotion', ROOT_MOTION_MODES, 'inPlace'),
      headEye: pick('headEye', HEAD_EYE_POLICIES, 'performer'),
      sourceRig: typeof m.sourceRig === 'string' ? m.sourceRig.slice(0, 48) : undefined,
    });
  });
  return errors.length ? { ok: false, errors }
    : { ok: true, config: { schemaVersion: data.schemaVersion as string, motions }, warnings };
}
