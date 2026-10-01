// Screen-level color grade for the call stage (work order 4). Pure config + math so the
// pixel math is unit-testable without WebGL; the shader (windows/room/gradePass.ts) only
// consumes the uniforms produced here, and the Live2D stage (work order 6) reuses them.

export type ToneMappingName = 'none' | 'aces' | 'agx' | 'neutral' | 'reinhard';
export const TONE_MAPPING_NAMES: readonly ToneMappingName[] = ['none', 'aces', 'agx', 'neutral', 'reinhard'];

export interface BloomCfg {
  on: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export interface GradeCfg {
  enabled: boolean;
  toneMapping: ToneMappingName;
  exposure: number;
  temperature: number;
  tint: number;
  saturation: number;
  contrast: number;
  lift: number;
  vignette: number;
  bloom: BloomCfg;
}

export const DEFAULT_GRADE: GradeCfg = {
  enabled: false,
  toneMapping: 'none',
  exposure: 1,
  temperature: 0,
  tint: 0,
  saturation: 1,
  contrast: 1,
  lift: 0,
  vignette: 0,
  bloom: { on: false, strength: 0.4, radius: 0.4, threshold: 0.85 },
};

function num(v: unknown, def: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
}

export function validateGrade(raw: unknown): GradeCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b = (r.bloom && typeof r.bloom === 'object' ? r.bloom : {}) as Record<string, unknown>;
  const d = DEFAULT_GRADE;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    toneMapping: TONE_MAPPING_NAMES.includes(r.toneMapping as ToneMappingName)
      ? (r.toneMapping as ToneMappingName) : d.toneMapping,
    exposure: num(r.exposure, d.exposure, 0.2, 3),
    temperature: num(r.temperature, d.temperature, -1, 1),
    tint: num(r.tint, d.tint, -1, 1),
    saturation: num(r.saturation, d.saturation, 0, 2),
    contrast: num(r.contrast, d.contrast, 0.5, 2),
    lift: num(r.lift, d.lift, -0.2, 0.2),
    vignette: num(r.vignette, d.vignette, 0, 1),
    bloom: {
      on: typeof b.on === 'boolean' ? b.on : d.bloom.on,
      strength: num(b.strength, d.bloom.strength, 0, 3),
      radius: num(b.radius, d.bloom.radius, 0, 1),
      threshold: num(b.threshold, d.bloom.threshold, 0, 1),
    },
  };
}

export interface GradeUniforms {
  /** Per-channel white-balance multiplier; [1,1,1] is identity. */
  gain: [number, number, number];
  lift: number;
  /** Scale about the 0.5 pivot; 1 is identity. */
  contrast: number;
  saturation: number;
  vignette: number;
}

/**
 * Order applied in the shader (do not reorder): white-balance gain -> lift -> contrast ->
 * saturation -> vignette. Exposure is applied earlier, on the renderer.
 */
export function gradeUniformsFrom(cfg: GradeCfg): GradeUniforms {
  const t = cfg.temperature;
  const g = cfg.tint;
  return {
    gain: [1 + 0.2 * t, 1 - 0.2 * g, 1 - 0.2 * t],
    lift: cfg.lift,
    contrast: cfg.contrast,
    saturation: cfg.saturation,
    vignette: cfg.vignette,
  };
}

/** True when the shader pass would be an identity transform. */
export function isNeutralGradeShader(cfg: GradeCfg): boolean {
  const u = gradeUniformsFrom(cfg);
  return u.gain.every(v => v === 1) && u.lift === 0 && u.contrast === 1
    && u.saturation === 1 && u.vignette === 0;
}

/** Only pay for an EffectComposer when something it does is actually visible. */
export function needsComposer(cfg: GradeCfg): boolean {
  return cfg.enabled && (cfg.bloom.on || !isNeutralGradeShader(cfg));
}

/** CPU reference of the shader math (minus vignette), used by tests and the Live2D path. */
export function applyGradeToRgb(rgb: [number, number, number], u: GradeUniforms): [number, number, number] {
  const out = rgb.map((c, i) => 0.5 + (c * u.gain[i] + u.lift - 0.5) * u.contrast) as [number, number, number];
  const luma = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  return out.map(v => luma + (v - luma) * u.saturation) as [number, number, number];
}

/**
 * The same grade (minus exposure, tone mapping, vignette and bloom, which a color matrix can't
 * express) as a 4x5 row-major color matrix for pixi's ColorMatrixFilter. Composed from the
 * same uniforms and in the same order as the shader, so both stages grade identically.
 */
export function gradeColorMatrix(cfg: GradeCfg): number[] {
  const u = gradeUniformsFrom(cfg);
  const L = [0.2126, 0.7152, 0.0722];
  const s = u.saturation;
  // Affine rgb transform as 3 rows of [r, g, b, offset]; start from identity.
  let m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  const mul = (b: number[][]) => {
    // b applied after m: result = b * m (offsets carried through)
    m = b.map(row => {
      const out = [0, 0, 0, row[3]];
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j < 4; j++) out[j] += row[k] * m[k][j];
      }
      return out;
    });
  };
  mul([[u.gain[0], 0, 0, 0], [0, u.gain[1], 0, 0], [0, 0, u.gain[2], 0]]);
  mul([[1, 0, 0, u.lift], [0, 1, 0, u.lift], [0, 0, 1, u.lift]]);
  const c = u.contrast;
  const o = 0.5 * (1 - c);
  mul([[c, 0, 0, o], [0, c, 0, o], [0, 0, c, o]]);
  mul([0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? s : 0) + (1 - s) * L[j]).concat(0)));
  // Each affine row is [r, g, b, offset]; a ColorMatrix row is [r, g, b, a, offset].
  return [
    ...m.flatMap(row => [row[0], row[1], row[2], 0, row[3]]),
    0, 0, 0, 1, 0,
  ];
}
