export const CEL_CATEGORIES = ['porcelain', 'metal', 'dark', 'accent', 'skin'] as const;
export type CelCategory = typeof CEL_CATEGORIES[number];
export type CelPalette = { lit: string; shade: string; deep: string; band: string; highlight: string };
export type RoomMaterialMode = 'original' | 'soft' | 'cel';
export interface CelConfig {
  mode: RoomMaterialMode;
  shadowCoverage: number;
  bandWidth: number;
  bandSaturation: number;
  outlinePx: number;
  structurePx: number;
  highlight: number;
  palettes: Record<CelCategory, CelPalette>;
}
export const DEFAULT_CEL: CelConfig = {
  mode: 'cel', shadowCoverage: 0.77, bandWidth: 0.03, bandSaturation: 0.95,
  outlinePx: 4, structurePx: 0.65, highlight: 0.45,
  palettes: {
    porcelain: { lit: '#ecf0ff', shade: '#6b7896', deep: '#343e5c', band: '#865bcf', highlight: '#cfdbff' },
    metal: { lit: '#a6bbdd', shade: '#515f7a', deep: '#30394e', band: '#7676bb', highlight: '#d0dcf4' },
    dark: { lit: '#292d3f', shade: '#252f46', deep: '#141c30', band: '#514879', highlight: '#596780' },
    accent: { lit: '#7861d9', shade: '#47516f', deep: '#27304b', band: '#8663c4', highlight: '#b5a5f4' },
    skin: { lit: '#f1c4bc', shade: '#a38b9d', deep: '#655568', band: '#b17da9', highlight: '#f1d4df' },
  },
};
export function celCategory(name: string): CelCategory {
  if (/Skin/.test(name)) return 'skin';
  if (/Silver|Pearl/.test(name)) return 'metal';
  if (/Charcoal|Ink|Indigo/.test(name)) return 'dark';
  if (/Cobalt|Violet|Accent/.test(name)) return 'accent';
  return 'porcelain';
}
export function validateCel(raw: unknown): CelConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const num = (key: keyof CelConfig, min: number, max: number) =>
    typeof r[key] === 'number' && Number.isFinite(r[key])
      ? Math.max(min, Math.min(max, r[key] as number)) : DEFAULT_CEL[key] as number;
  const p = (r.palettes && typeof r.palettes === 'object' ? r.palettes : {}) as Record<string, unknown>;
  const palettes = Object.fromEntries(CEL_CATEGORIES.map(category => {
    const src = (p[category] && typeof p[category] === 'object' ? p[category] : {}) as Record<string, unknown>;
    return [category, Object.fromEntries(Object.entries(DEFAULT_CEL.palettes[category]).map(([key, value]) =>
      [key, typeof src[key] === 'string' && /^#[0-9a-fA-F]{6}$/.test(src[key] as string) ? src[key] : value]))];
  })) as Record<CelCategory, CelPalette>;
  return { mode: ['original', 'soft', 'cel'].includes(String(r.mode)) ? r.mode as RoomMaterialMode : 'original',
    shadowCoverage: num('shadowCoverage', 0.2, 0.9), bandWidth: num('bandWidth', 0, 0.15),
    bandSaturation: num('bandSaturation', 0, 2), outlinePx: num('outlinePx', 0, 6),
    structurePx: num('structurePx', 0, 2), highlight: num('highlight', 0, 1), palettes };
}
/** An explicit original selection wins over the legacy query opt-in. */
export function resolveCel(saved: CelConfig | undefined, requested: boolean): CelConfig {
  return saved ?? { ...DEFAULT_CEL, mode: requested ? 'cel' : 'original' };
}
export interface CelPreset { name: string; config: CelConfig }
export const BUILTIN_CEL: Record<string, CelConfig> = {
  blueGray: DEFAULT_CEL,
  violet: { ...DEFAULT_CEL, bandSaturation: 1.2, palettes: {
    porcelain: { ...DEFAULT_CEL.palettes.porcelain, shade: '#6654a4', deep: '#302653', band: '#9751e1' },
    metal: { ...DEFAULT_CEL.palettes.metal, shade: '#554c83', deep: '#302747', band: '#846bd0' },
    dark: { ...DEFAULT_CEL.palettes.dark, shade: '#302750', deep: '#1b142c', band: '#654588' },
    accent: { ...DEFAULT_CEL.palettes.accent, shade: '#49377b', deep: '#271c43', band: '#aa54da' },
    skin: DEFAULT_CEL.palettes.skin,
  } },
};
export function validateCelPresets(raw: unknown): Record<string, CelPreset> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, CelPreset> = {};
  for (const [id, value] of Object.entries(raw).slice(0, 32)) {
    if (!/^user-[a-zA-Z0-9-]{1,80}$/.test(id) || !value || typeof value !== 'object') continue;
    const preset = value as Record<string, unknown>, config = validateCel(preset.config);
    if (typeof preset.name === 'string' && preset.name.trim() && config)
      out[id] = { name: preset.name.trim().slice(0, 64), config };
  }
  return out;
}
// Shader/coverage reference: normalized N dot L, hard thresholds, no view-facing rim.
export function celRegion(nDotL: number, cfg: CelConfig): 'lit' | 'shade' | 'deep' | 'band' {
  const t = Math.max(0, Math.min(1, nDotL * 0.5 + 0.5));
  if (cfg.bandWidth > 0 && Math.abs(t - cfg.shadowCoverage) < cfg.bandWidth * 0.5) return 'band';
  if (t >= cfg.shadowCoverage) return 'lit';
  return t < cfg.shadowCoverage * 0.46 ? 'deep' : 'shade';
}
