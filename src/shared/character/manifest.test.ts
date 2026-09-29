import { describe, expect, it } from 'vitest';
import { safePackagePath, validateCharacterManifest } from './manifest';

const digest = 'a'.repeat(64);
const manifest = {
  schemaVersion: '1.0.0', assetId: 'sample.actor', revision: digest,
  provenance: { author: 'Example', license: 'CC0-1.0' },
  minimumRuntime: '1.0.0', capabilities: ['humanoid'],
  model: { uri: 'model.glb', sha256: digest },
  resources: { rig: 'rig/humanoid.json' },
};
const entries = ['manifest.json', 'model.glb', 'rig/humanoid.json'];

describe('CA-01 manifest contract', () => {
  it('accepts a directory manifest and ignores unknown optional data', () => {
    expect(validateCharacterManifest({ ...manifest, futureNote: true }, entries)).toMatchObject({ ok: true });
  });
  it('rejects unknown required extension and newer contract major', () => {
    expect(validateCharacterManifest({ ...manifest, requiredExtensions: ['future.shader'] }, entries)).toMatchObject({ ok: false });
    expect(validateCharacterManifest({ ...manifest, schemaVersion: '2.0.0' }, entries)).toMatchObject({ ok: false });
  });
  it('rejects traversal, duplicate names and missing resources', () => {
    for (const path of ['../model.glb', '/model.glb', 'C:/model.glb', 'rig\\body.json', 'a//b']) {
      expect(safePackagePath(path)).toBe(false);
    }
    expect(validateCharacterManifest(manifest, [...entries, 'MODEL.GLB'])).toMatchObject({ ok: false });
    expect(validateCharacterManifest(manifest, entries.slice(0, 2))).toMatchObject({ ok: false });
  });
  it('keeps filename independent from assetId and rejects a missing declared model', () => {
    expect(validateCharacterManifest({ ...manifest, model: { uri: 'renamed.glb', sha256: digest } }, entries)).toMatchObject({ ok: false });
  });
});
