/** CA-06 materials.json contract: pure parsing, parameter resolution and ramp math (no Three.js). */
export const TOON_TEMPLATES = ['FACE', 'HAIR', 'CLOTH'] as const;
export type ToonTemplate = typeof TOON_TEMPLATES[number];
/** Named by the contract but without a runtime consumer yet; bindings using them are skipped, not faked. */
export const PLANNED_TEMPLATES = ['SKIN', 'METAL', 'EYE', 'GLASS'] as const;

export interface ToonParams {
  /** sRGB hex. Omitted = keep the source material's base color/texture untouched. */
  baseColor?: string;
  /** sRGB hex tint of the shadowed side when no shadeMap is given (multiplies the base color). */
  shadeColor: string;
  /** Cosine(light, normal) where the lit/shade mix starts, [-1, 1] (Blender "Shadow Edge Low"). */
  edgeLow: number;
  /** Cosine(light, normal) where the mix is fully lit, [-1, 1] (Blender "Shadow Edge High"). */
  edgeHigh: number;
  /** Strength of the transition-tint bell curve at the lit/shade border, [0, 4]. */
  transitionStrength: number;
  rimColor: string;
  /** Additive rim intensity, [0, 2]; 0 disables the rim. */
  rimStrength: number;
  /** Exponent of the facing term (1 - N.V), [0.5, 8]; the Blender graph uses 5. */
  rimPower: number;
  /** Hair highlight intensity pow(max(N.H, 0), 12), [0, 2]; 0 disables it. */
  hairSheen: number;
  /** Sidecar PNG file name (same directory as the model) giving the shade color per texel. */
  shadeMap?: string;
  /** Sidecar PNG file name giving the color blended in at the lit/shade border. */
  transitionMap?: string;
}

type Range = { min: number; max: number };
const RANGES: Record<'edgeLow' | 'edgeHigh' | 'transitionStrength' | 'rimStrength' | 'rimPower' | 'hairSheen', Range> = {
  edgeLow: { min: -1, max: 1 },
  edgeHigh: { min: -1, max: 1 },
  transitionStrength: { min: 0, max: 4 },
  rimStrength: { min: 0, max: 2 },
  rimPower: { min: 0.5, max: 8 },
  hairSheen: { min: 0, max: 2 },
};
const COLOR_KEYS = ['baseColor', 'shadeColor', 'rimColor'] as const;
const NUMBER_KEYS = Object.keys(RANGES) as (keyof typeof RANGES)[];
const MAP_KEYS = ['shadeMap', 'transitionMap'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
/** Single path component, no separators: maps must sit beside the model. */
export const MAP_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.png$/;

const BASE_DEFAULTS: ToonParams = {
  shadeColor: '#8a8fa8', edgeLow: -0.22, edgeHigh: 0.68, transitionStrength: 0.2,
  rimColor: '#ffffff', rimStrength: 0, rimPower: 5, hairSheen: 0,
};
/** Per-template defaults layer over the shared base so templates differ by data, not by shader forks. */
export const TEMPLATE_DEFAULTS: Record<ToonTemplate, ToonParams> = {
  FACE: { ...BASE_DEFAULTS, shadeColor: '#c9a9a6' },
  HAIR: { ...BASE_DEFAULTS, shadeColor: '#6f6a88', rimStrength: 0.25, hairSheen: 0.075 },
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
  const checkNumber = (key: keyof typeof RANGES, value: unknown): number | undefined => {
    const range = RANGES[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= range.min && value <= range.max) return value;
    errors.push(`${where}: ${key} must be a number in [${range.min}, ${range.max}]`);
    return undefined;
  };
  for (const [key, value] of Object.entries(data)) {
    if ((COLOR_KEYS as readonly string[]).includes(key)) {
      if (typeof value === 'string' && HEX.test(value)) (out as Record<string, unknown>)[key] = value.toLowerCase();
      else errors.push(`${where}: ${key} must be #rrggbb`);
    } else if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const n = checkNumber(key as keyof typeof RANGES, value);
      if (n !== undefined) (out as Record<string, unknown>)[key] = n;
    } else if ((MAP_KEYS as readonly string[]).includes(key)) {
      if (typeof value === 'string' && MAP_FILE.test(value)) (out as Record<string, unknown>)[key] = value;
      else errors.push(`${where}: ${key} must be a .png file name beside the model`);
    } else if (key !== 'shadeThreshold' && key !== 'shadeSoftness') {
      warnings.push(`${where}: ignored unknown param ${key}`);
    }
  }
  // Pre-v2 sidecars: threshold/softness become the equivalent edge pair unless edges are explicit.
  const threshold = data.shadeThreshold, softness = data.shadeSoftness;
  if (threshold !== undefined || softness !== undefined) {
    warnings.push(`${where}: shadeThreshold/shadeSoftness are legacy; use edgeLow/edgeHigh`);
    const t = typeof threshold === 'number' ? threshold : 0.1;
    const half = (typeof softness === 'number' ? softness : 0.08) / 2;
    if (data.edgeLow === undefined) out.edgeLow = Math.max(-1, Math.min(1, t - half));
    if (data.edgeHigh === undefined) out.edgeHigh = Math.max(-1, Math.min(1, t + half));
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

export function hexToLinear(hex: string): [number, number, number] {
  const channel = (offset: number) => {
    const s = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}
