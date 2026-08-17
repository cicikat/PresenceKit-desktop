import { invoke } from '@tauri-apps/api/core';
import { getUIPref, setUIPref } from '../uiPreferences';
import { inspectThemeCss } from '../theme/cssGuard';
import { applyDesignTheme, restoreConfiguredTheme } from '../theme/registry';
import { applyDesignLayout, restoreConfiguredLayout } from '../layout/registry';
import { validateLayout } from '../layout/loader';
import { validateTheme } from '../theme/loader';
import { ComponentAttachmentRegistry } from './components';
import { createDesignModHostLedger, DesignModLifecycle, type ActivationContext } from './lifecycle';
import { DESIGN_MOD_DEFAULT_ID, validateDesignModManifest, validateDesignModPackage, type DesignComponentId } from './contract';
import type { DesignModDiagnostic, DesignModManifest, DesignModPackage, DesignModRecord } from './types';

export const DESIGN_MOD_PREF = 'chat.designMod';

interface DesignModAssetResponse { mime: string; base64: string; }

export interface DesignModReadApi {
  read(id: string, file: string): Promise<string>;
  assetUrl(id: string, file: string, onRevoke: (url: string) => void): Promise<string>;
}

function joinPackagePath(parent: string, child: string): string {
  const base = parent.split('/').slice(0, -1);
  return [...base, child].join('/');
}

export const designModReadApi: DesignModReadApi = {
  async read(id, file) {
    try {
      return await invoke<string>('read_design_mod_file', { id, file });
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      const response = await fetch(`/design-mods/${encodeURIComponent(id)}/${file}`);
      if (!response.ok) throw new Error(`设计 Mod 文件读取失败 HTTP ${response.status}: ${file}`);
      return response.text();
    }
  },
  async assetUrl(id, file, onRevoke) {
    try {
      const response = await invoke<DesignModAssetResponse>('read_design_mod_asset', { id, file });
      const binary = Uint8Array.from(atob(response.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([binary], { type: response.mime || 'application/octet-stream' }));
      onRevoke(url);
      return url;
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      return `/design-mods/${encodeURIComponent(id)}/${file}`;
    }
  },
};

export async function listDesignMods(refresh = false): Promise<DesignModRecord[]> {
  if (!refresh && cachedRecords) return cachedRecords;
  const records: DesignModRecord[] = [{
    source: 'builtin',
    manifest: {
      schemaVersion: 1,
      id: DESIGN_MOD_DEFAULT_ID,
      name: '内置默认设计',
      author: 'PresenceKit',
      version: '1.0.0',
      entry: 'builtin',
    },
  }];
  try {
    const manifests = await invoke<unknown[]>('list_design_mods');
    for (const value of manifests) {
      const errors = validateDesignModManifest(value);
      if (errors.length > 0) {
        console.warn('[design-mod] 忽略非法 manifest:', errors);
        continue;
      }
      records.push({ manifest: value as DesignModManifest, source: 'design-mod' });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      try {
        const response = await fetch('/design-mods/index.json');
        if (response.ok) {
          const values = await response.json() as unknown[];
          for (const value of values) {
            if (validateDesignModManifest(value).length === 0) records.push({ manifest: value as DesignModManifest, source: 'design-mod' });
          }
        }
      } catch {
        console.warn('[design-mod] 开发资源列表读取失败:', error);
      }
    } else {
      console.warn('[design-mod] 设计 Mod 目录读取失败:', error);
    }
  }
  cachedRecords = records;
  return records;
}

let cachedRecords: DesignModRecord[] | null = null;
export function invalidateDesignModCache(): void { cachedRecords = null; }
export function getSelectedDesignModId(): string { return getUIPref(DESIGN_MOD_PREF, DESIGN_MOD_DEFAULT_ID); }
export function setSelectedDesignModId(id: string): void { setUIPref(DESIGN_MOD_PREF, id); }

export async function loadDesignModPackage(record: DesignModRecord, readApi: DesignModReadApi = designModReadApi): Promise<DesignModPackage> {
  if (record.source === 'builtin') throw new Error('builtin-default 不需要加载运行时代码');
  const { manifest } = record;
  const entrySource = await readApi.read(manifest.id, manifest.entry);
  if (/^\s*import\s+|\bimport\s*\(/m.test(entrySource)) {
    throw new Error('entry.js 必须是已打包单文件 ESM，不能包含运行时裸 import');
  }
  let theme: DesignModPackage['theme'];
  let themeCss: string | null = null;
  let layout: DesignModPackage['layout'];
  let layoutCss: string | null = null;
  if (manifest.theme) {
    theme = JSON.parse(await readApi.read(manifest.id, manifest.theme));
    if (theme?.css) {
      themeCss = await readApi.read(manifest.id, joinPackagePath(manifest.theme, theme.css));
      const guard = inspectThemeCss(themeCss);
      if (!guard.ok) throw new Error(`theme.css 安检失败: ${guard.reasons.join('；')}`);
    }
    const errors = validateTheme(theme);
    if (errors.length) throw new Error(`theme 校验失败: ${errors.join('；')}`);
  }
  if (manifest.layout) {
    layout = JSON.parse(await readApi.read(manifest.id, manifest.layout));
    if (layout?.css) {
      layoutCss = await readApi.read(manifest.id, joinPackagePath(manifest.layout, layout.css));
      const guard = inspectThemeCss(layoutCss);
      if (!guard.ok) throw new Error(`layout.css 安检失败: ${guard.reasons.join('；')}`);
    }
    const errors = validateLayout(layout);
    if (errors.length) throw new Error(`layout 校验失败: ${errors.join('；')}`);
  }
  const errors = validateDesignModPackage(manifest, { expectedId: manifest.id, theme, layout });
  if (errors.length) throw new Error(errors.join('；'));
  return { ...record, entrySource, styleText: manifest.style ? await readApi.read(manifest.id, manifest.style) : null, theme, themeCss, layout, layoutCss, assetRootId: manifest.id };
}

export function applyDesignModPackage(pkg: DesignModPackage): void {
  if (pkg.theme) applyDesignTheme({ manifest: pkg.theme, source: 'design-mod', cssText: pkg.themeCss ?? undefined });
  if (pkg.layout) applyDesignLayout({ manifest: pkg.layout, source: 'design-mod', cssText: pkg.layoutCss ?? undefined });
}

export function restoreDefaultDesign(): void {
  restoreConfiguredTheme();
  restoreConfiguredLayout();
}

export function importDesignMod(entrySource: string): { modulePromise: Promise<{ activate?: unknown }>; revoke: () => void } {
  const url = URL.createObjectURL(new Blob([entrySource], { type: 'text/javascript' }));
  return {
    modulePromise: import(/* @vite-ignore */ url) as Promise<{ activate?: unknown }>,
    revoke: () => URL.revokeObjectURL(url),
  };
}

export function createTrustedComponentRegistry() {
  const registry = new ComponentAttachmentRegistry();
  return {
    attach(id: DesignComponentId, mount: HTMLElement) { return registry.attach(id, mount); },
    detach(id: DesignComponentId) { return registry.detach(id); },
    list() { return registry.list(); },
    clear() { registry.clear(); },
  };
}

export function formatDiagnostic(phase: DesignModDiagnostic['phase'], message: string, error?: unknown): DesignModDiagnostic {
  return { phase, message, error: error instanceof Error ? error.message : error ? String(error) : undefined, updatedAt: Date.now() };
}

export { createDesignModHostLedger, DesignModLifecycle } from './lifecycle';
export type { ActivationContext } from './lifecycle';
