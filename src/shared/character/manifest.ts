/** CA-01 package contract. Runtime loading is introduced by later CA work orders. */
export interface CharacterManifest {
  schemaVersion: string;
  assetId: string;
  revision: string;
  provenance: { author: string; license: string; source?: string };
  minimumRuntime: string;
  capabilities: string[];
  model: { uri: string; sha256: string };
  resources?: {
    materials?: string;
    rig?: string;
    calibration?: string;
    expressions?: string;
    motions?: string;
  };
  requiredExtensions?: string[];
}

export type ManifestResult =
  | { ok: true; manifest: CharacterManifest; warnings: string[] }
  | { ok: false; errors: string[] };

const SUPPORTED_MAJOR = 1;
const RUNTIME_VERSION = [1, 0, 0];
const KNOWN_CAPABILITIES = new Set(['humanoid', 'expressions', 'lookAt', 'motions', 'toon']);
const KNOWN_EXTENSIONS = new Set<string>();
const RESOURCE_KEYS = ['materials', 'rig', 'calibration', 'expressions', 'motions'] as const;
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

export function safePackagePath(path: string): boolean {
  if (!path || path.includes('\\') || path.startsWith('/') || path.includes(':') || path.includes('\0')) return false;
  const parts = path.split('/');
  return parts.every(part => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.'));
}

function version(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  return value.split('.').map(Number);
}

/** Directory and ZIP adapters must both pass the complete relative entry list here. */
export function validateCharacterManifest(raw: unknown, entries: readonly string[]): ManifestResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = asRecord(raw);
  if (!data) return { ok: false, errors: ['manifest must be an object'] };
  const schema = version(data.schemaVersion);
  if (!schema || schema[0] !== SUPPORTED_MAJOR) errors.push('unsupported schemaVersion');
  if (typeof data.assetId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(data.assetId)) errors.push('invalid assetId');
  if (typeof data.revision !== 'string' || !/^[a-f0-9]{64}$/.test(data.revision)) errors.push('revision must be a SHA-256 hex digest');
  const minimumRuntime = version(data.minimumRuntime);
  if (!minimumRuntime || minimumRuntime[0] > RUNTIME_VERSION[0]
    || minimumRuntime[0] === RUNTIME_VERSION[0] && (
      minimumRuntime[1] > RUNTIME_VERSION[1]
      || minimumRuntime[1] === RUNTIME_VERSION[1] && minimumRuntime[2] > RUNTIME_VERSION[2]
    )) errors.push('minimumRuntime is unsupported');
  const provenance = asRecord(data.provenance);
  if (!provenance || typeof provenance.author !== 'string' || !provenance.author.trim()
    || typeof provenance.license !== 'string' || !provenance.license.trim()
    || provenance.source !== undefined && typeof provenance.source !== 'string') errors.push('invalid provenance');
  if (!Array.isArray(data.capabilities) || data.capabilities.some(value => typeof value !== 'string')) {
    errors.push('capabilities must be strings');
  } else {
    for (const capability of data.capabilities) if (!KNOWN_CAPABILITIES.has(capability)) warnings.push(`unknown capability: ${capability}`);
  }
  if (data.requiredExtensions !== undefined) {
    if (!Array.isArray(data.requiredExtensions) || data.requiredExtensions.some(value => typeof value !== 'string')) {
      errors.push('requiredExtensions must be strings');
    } else for (const extension of data.requiredExtensions) if (!KNOWN_EXTENSIONS.has(extension)) errors.push(`unsupported required extension: ${extension}`);
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!safePackagePath(entry)) errors.push(`unsafe entry: ${entry}`);
    const key = entry.toLowerCase();
    if (seen.has(key)) errors.push(`duplicate entry: ${entry}`);
    seen.add(key);
  }
  const model = asRecord(data.model);
  const resources = data.resources === undefined ? null : asRecord(data.resources);
  if (!model || typeof model.uri !== 'string' || typeof model.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(model.sha256)) errors.push('invalid model reference');
  if (data.resources !== undefined && !resources) errors.push('resources must be an object');
  const referenced = model?.uri && typeof model.uri === 'string' ? [model.uri] : [];
  if (resources) for (const key of RESOURCE_KEYS) {
    const path = resources[key];
    if (path !== undefined && typeof path !== 'string') errors.push(`invalid resources.${key}`);
    else if (typeof path === 'string') referenced.push(path);
  }
  for (const path of referenced) {
    if (!safePackagePath(path)) errors.push(`unsafe reference: ${path}`);
    else if (!seen.has(path.toLowerCase())) errors.push(`missing reference: ${path}`);
  }
  if (!seen.has('manifest.json')) errors.push('missing manifest.json');
  return errors.length ? { ok: false, errors } : { ok: true, manifest: raw as CharacterManifest, warnings };
}
