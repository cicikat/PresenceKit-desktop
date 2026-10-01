/** CA-06 materials.json contract: pure parsing, parameter resolution and ramp math (no Three.js). */
export const TOON_TEMPLATES = ['FACE', 'HAIR', 'CLOTH'] as const;
export type ToonTemplate = typeof TOON_TEMPLATES[number];
/** Named by the contract but without a runtime consumer yet; bindings using them are skipped, not faked. */
export const PLANNED_TEMPLATES = ['SKIN', 'METAL', 'EYE', 'GLASS'] as const;

export interface ToonParams {
  /** sRGB hex. Omitted = keep the source material's base color/texture untouched. */
  baseColor?: string;
  /** sRGB hex of the shadowed side; the ramp stores shade/base so textured materials tint correctly. */
  shadeColor: string;
  /** Cosine of the light/normal angle where lit meets shade, [-1, 1]. */
  shadeThreshold: number;
  /** Width of the lit/shade transition in cosine units, [0, 1]; 0 is a hard edge. */
  shadeSoftness: number;
  rimColor: string;
  /** Additive rim intensity, [0, 2]; 0 disables the rim. */
  rimStrength: number;
  /** Fresnel exponent, [0.5, 8]; larger = thinner rim. */
  rimPower: number;
}

type Range = { min: number; max: number };
const RANGES: Record<'shadeThreshold' | 'shadeSoftness' | 'rimStrength' | 'rimPower', Range> = {
  shadeThreshold: { min: -1, max: 1 },
  shadeSoftness: { min: 0, max: 1 },
  rimStrength: { min: 0, max: 2 },
  rimPower: { min: 0.5, max: 8 },
};
const COLOR_KEYS = ['baseColor', 'shadeColor', 'rimColor'] as const;
const NUMBER_KEYS = Object.keys(RANGES) as (keyof typeof RANGES)[];
const HEX = /^#[0-9a-fA-F]{6}$/;

const BASE_DEFAULTS: ToonParams = {
  shadeColor: '#8a8fa8', shadeThreshold: 0.1, shadeSoftness: 0.08,
  rimColor: '#ffffff', rimStrength: 0, rimPower: 3,
};
/** Per-template defaults layer over the shared base so templates differ by data, not by shader forks. */
export const TEMPLATE_DEFAULTS: Record<ToonTemplate, ToonParams> = {
  FACE: { ...BASE_DEFAULTS, shadeColor: '#c9a9a6', shadeThreshold: -0.05, shadeSoftness: 0.25 },
  HAIR: { ...BASE_DEFAULTS, shadeColor: '#6f6a88', rimStrength: 0.25, rimPower: 4 },
  CLOTH: { ...BASE_DEFAULTS },
};

export interface MaterialBinding {
  id: string;
  /** Mesh node name and material slot index; the pair must be unique. Names alone are not an identity. */
  mesh: string;
  slot: number;
  /** Name at authoring time; a mismatch marks the binding stale instead of applying it blindly. */
  materialName?: string;
  template: ToonTemplate;
  params: Partial<ToonParams>;
}

export interface MaterialsConfig {
  schemaVersion: string;
  bindings: MaterialBinding[];
  /** Appearance variants: look name -> binding id -> param overrides. Switching needs no re-bake. */
  looks: Record<string, Record<string, Partial<ToonParams>>>;
}

export type MaterialsResult =
  | { ok: true; config: MaterialsConfig; warnings: string[] }
  | { ok: false; errors: string[] };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

function parseParams(raw: unknown, where: string, errors: string[], warnings: string[]): Partial<ToonParams> {
  const out: Partial<ToonParams> = {};
  if (raw === undefined) return out;
  const data = asRecord(raw);
  if (!data) { errors.push(`${where}: params must be an object`); return out; }
  for (const [key, value] of Object.entries(data)) {
    if ((COLOR_KEYS as readonly string[]).includes(key)) {
      if (typeof value === 'string' && HEX.test(value)) (out as Record<string, unknown>)[key] = value.toLowerCase();
      else errors.push(`${where}: ${key} must be #rrggbb`);
    } else if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const range = RANGES[key as keyof typeof RANGES];
      if (typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max) {
        (out as Record<string, unknown>)[key] = value;
      } else errors.push(`${where}: ${key} must be a number in [${range.min}, ${range.max}]`);
    } else warnings.push(`${where}: ignored unknown param ${key}`);
  }
  return out;
}

export function parseMaterialsConfig(raw: unknown): MaterialsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = asRecord(raw);
  if (!data) return { ok: false, errors: ['materials must be an object'] };
  if (typeof data.schemaVersion !== 'string' || !/^1\.\d+\.\d+$/.test(data.schemaVersion)) errors.push('unsupported schemaVersion');
  if (!Array.isArray(data.bindings)) errors.push('bindings must be an array');
  const bindings: MaterialBinding[] = [];
  const ids = new Set<string>();
  const slots = new Set<string>();
  for (const [index, item] of (Array.isArray(data.bindings) ? data.bindings : []).entries()) {
    const where = `bindings[${index}]`;
    const b = asRecord(item);
    if (!b) { errors.push(`${where}: must be an object`); continue; }
    if (typeof b.id !== 'string' || !/^[A-Za-z0-9._-]{1,48}$/.test(b.id)) errors.push(`${where}: invalid id`);
    else if (ids.has(b.id)) errors.push(`${where}: duplicate id ${b.id}`);
    else ids.add(b.id);
    if (typeof b.mesh !== 'string' || !b.mesh) errors.push(`${where}: mesh required`);
    if (!Number.isInteger(b.slot) || (b.slot as number) < 0) errors.push(`${where}: slot must be a non-negative integer`);
    if (typeof b.mesh === 'string' && Number.isInteger(b.slot)) {
      const key = `${b.mesh}#${b.slot}`;
      if (slots.has(key)) errors.push(`${where}: mesh/slot ${key} bound twice`);
      slots.add(key);
    }
    if (b.materialName !== undefined && typeof b.materialName !== 'string') errors.push(`${where}: materialName must be a string`);
    const template = b.template as string;
    if ((PLANNED_TEMPLATES as readonly string[]).includes(template)) {
      warnings.push(`${where}: template ${template} is planned; binding will be skipped`);
    } else if (!(TOON_TEMPLATES as readonly string[]).includes(template)) {
      errors.push(`${where}: unknown template ${String(template)}`);
    }
    const params = parseParams(b.params, where, errors, warnings);
    if ((TOON_TEMPLATES as readonly string[]).includes(template) && typeof b.id === 'string'
      && typeof b.mesh === 'string' && Number.isInteger(b.slot)) {
      bindings.push({
        id: b.id, mesh: b.mesh, slot: b.slot as number,
        materialName: typeof b.materialName === 'string' ? b.materialName : undefined,
        template: template as ToonTemplate, params,
      });
    }
  }
  const looks: MaterialsConfig['looks'] = {};
  const looksRaw = data.looks === undefined ? {} : asRecord(data.looks);
  if (!looksRaw) errors.push('looks must be an object');
  else for (const [name, entry] of Object.entries(looksRaw)) {
    const overrides = asRecord(entry);
    if (!overrides) { errors.push(`looks.${name}: must be an object`); continue; }
    looks[name] = {};
    for (const [bindingId, params] of Object.entries(overrides)) {
      if (!ids.has(bindingId)) { warnings.push(`looks.${name}: unknown binding ${bindingId}`); continue; }
      looks[name][bindingId] = parseParams(params, `looks.${name}.${bindingId}`, errors, warnings);
    }
  }
  return errors.length ? { ok: false, errors }
    : { ok: true, config: { schemaVersion: data.schemaVersion as string, bindings, looks }, warnings };
}

/** Priority: template default < package binding < selected look < local override. */
export function resolveToonParams(
  binding: MaterialBinding,
  look?: Partial<ToonParams>,
  local?: Partial<ToonParams>,
): ToonParams {
  return { ...TEMPLATE_DEFAULTS[binding.template], ...binding.params, ...look, ...local };
}

/** Ramp texel i (of n) covers cos = i/(n-1)*2-1, matching three's toon `dotNL * 0.5 + 0.5` lookup. */
export function buildToonRamp(params: ToonParams, base: [number, number, number], size = 64): Uint8Array {
  const shade = hexToLinear(params.shadeColor);
  // Ratio of shade to base, clamped so a darker-than-shade base never brightens the lit side.
  const ratio = shade.map((c, i) => Math.min(1, c / Math.max(base[i], 1e-3)));
  const half = params.shadeSoftness / 2;
  const out = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const cos = (i / (size - 1)) * 2 - 1;
    const w = smoothstep(params.shadeThreshold - half, params.shadeThreshold + half, cos);
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((ratio[c] + (1 - ratio[c]) * w) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function hexToLinear(hex: string): [number, number, number] {
  const channel = (offset: number) => {
    const s = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
