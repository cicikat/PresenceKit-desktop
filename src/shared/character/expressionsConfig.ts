/** CA-04 expressions.json contract: maps semantic expression names onto weighted morph targets. Data only. */
export const SEMANTIC_EXPRESSIONS = [
  'smile', 'sad', 'angry', 'surprised', 'blush', 'browDown', 'eyesWide',
  'blink', 'mouthOpen', 'eyeLookLeft', 'eyeLookRight', 'eyeLookUp', 'eyeLookDown',
] as const;

export interface ExpressionTarget {
  /** Morph key name on the model. */
  key: string;
  /** Mesh node name; omit to drive the key on every mesh that has it. Needed when names repeat. */
  mesh?: string;
  /** Multiplier on the semantic weight, [0, 2]. Default 1. */
  weight: number;
}

export interface ExpressionsConfig {
  schemaVersion: string;
  expressions: Record<string, ExpressionTarget[]>;
}

export type ExpressionsResult =
  | { ok: true; config: ExpressionsConfig; warnings: string[] }
  | { ok: false; errors: string[] };

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const MAX_EXPRESSIONS = 64;
const MAX_TARGETS = 16;

export function parseExpressionsConfig(raw: unknown): ExpressionsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = asRecord(raw);
  if (!data) return { ok: false, errors: ['expressions must be an object'] };
  if (typeof data.schemaVersion !== 'string' || !/^1\.\d+\.\d+$/.test(data.schemaVersion)) errors.push('unsupported schemaVersion');
  const list = asRecord(data.expressions);
  if (!list) errors.push('expressions must be an object');
  const out: ExpressionsConfig['expressions'] = {};
  const entries = Object.entries(list ?? {});
  if (entries.length > MAX_EXPRESSIONS) errors.push(`at most ${MAX_EXPRESSIONS} expressions`);
  for (const [name, value] of entries.slice(0, MAX_EXPRESSIONS)) {
    const where = `expressions.${name}`;
    if (!NAME.test(name)) { errors.push(`${where}: invalid semantic name`); continue; }
    if (!(SEMANTIC_EXPRESSIONS as readonly string[]).includes(name)) {
      warnings.push(`${where}: no runtime consumer for this name; ignored`);
      continue;
    }
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TARGETS) {
      errors.push(`${where}: must be a list of 1-${MAX_TARGETS} targets`);
      continue;
    }
    const targets: ExpressionTarget[] = [];
    value.forEach((item, i) => {
      const t = asRecord(item);
      if (!t || typeof t.key !== 'string' || !t.key || t.key.length > 96) { errors.push(`${where}[${i}]: key required`); return; }
      if (t.mesh !== undefined && (typeof t.mesh !== 'string' || !t.mesh)) { errors.push(`${where}[${i}]: mesh must be a non-empty string`); return; }
      const weight = t.weight === undefined ? 1 : t.weight;
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 2) {
        errors.push(`${where}[${i}]: weight must be a number in [0, 2]`);
        return;
      }
      targets.push({ key: t.key, mesh: t.mesh as string | undefined, weight });
    });
    out[name] = targets;
  }
  return errors.length ? { ok: false, errors }
    : { ok: true, config: { schemaVersion: data.schemaVersion as string, expressions: out }, warnings };
}
