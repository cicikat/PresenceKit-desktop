import { invoke } from '@tauri-apps/api/core';
import { getUIPref, onUIPrefChange, setUIPref } from '../uiPreferences';
import { inspectThemeCss } from '../theme/cssGuard';
import { BUILTIN_LAYOUTS, OBSIDIAN_DEFAULT_LAYOUT } from './builtinLayouts';
import { applyLayoutCss, validateLayout } from './loader';
import type { LayoutManifest, LayoutRecord } from './types';

const PREF_KEY = 'chat.layout';
const listeners = new Set<() => void>();
let records: LayoutRecord[] | null = null;
let currentLayout: LayoutRecord = { manifest: OBSIDIAN_DEFAULT_LAYOUT, source: 'builtin' };

function validRecord(manifest: unknown, source: LayoutRecord['source']): LayoutRecord | null {
  const errors = validateLayout(manifest);
  if (errors.length > 0) {
    const id = typeof (manifest as LayoutManifest | null)?.id === 'string'
      ? (manifest as LayoutManifest).id
      : '未知';
    console.warn(`[layout] 忽略布局 "${id}"，${errors.join('；')}`);
    return null;
  }
  return { manifest: manifest as LayoutManifest, source };
}

async function loadLayoutCss(record: LayoutRecord): Promise<string> {
  const { id, css } = record.manifest;
  if (!css) throw new Error('CSS 文件名缺失');
  if (record.source === 'disk') {
    try {
      return await invoke<string>('read_layout_css', { id, file: css });
    } catch (error) {
      if (!import.meta.env.DEV) throw error;
      console.warn(`[layout] 磁盘 CSS IPC 读取失败，使用开发服务器 fallback: ${id}`, error);
    }
  }
  const response = await fetch(`/layouts/${id}/${css}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function selectCurrent(layouts: LayoutRecord[]): LayoutRecord {
  const wanted = getUIPref(PREF_KEY, OBSIDIAN_DEFAULT_LAYOUT.id);
  return layouts.find(record => record.manifest.id === wanted)
    ?? layouts.find(record => record.manifest.id === OBSIDIAN_DEFAULT_LAYOUT.id)
    ?? { manifest: OBSIDIAN_DEFAULT_LAYOUT, source: 'builtin' };
}

export async function listLayouts(refresh = false): Promise<LayoutRecord[]> {
  if (records && !refresh) return records;
  const merged = new Map<string, LayoutRecord>();
  for (const manifest of BUILTIN_LAYOUTS) {
    const record = validRecord(manifest, 'builtin');
    if (record) merged.set(manifest.id, record);
  }
  try {
    const diskLayouts = await invoke<unknown[]>('list_layouts');
    for (const manifest of diskLayouts) {
      const record = validRecord(manifest, 'disk');
      if (record) merged.set(record.manifest.id, record);
    }
  } catch (error) {
    console.warn('[layout] 磁盘布局目录读取失败，继续使用内置布局:', error);
  }

  const valid: LayoutRecord[] = [];
  for (const record of merged.values()) {
    if (!record.manifest.css) {
      valid.push(record);
      continue;
    }
    try {
      const cssText = await loadLayoutCss(record);
      const guard = inspectThemeCss(cssText);
      if (guard.ok) valid.push({ ...record, cssText });
      else console.warn(`[layout] "${record.manifest.id}" 自定义 CSS 被拒:`, guard.reasons);
    } catch (error) {
      console.warn(`[layout] "${record.manifest.id}" CSS 文件读取失败:`, error);
    }
  }
  records = valid.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
  currentLayout = selectCurrent(records);
  return records;
}

export function getLayout(): LayoutRecord {
  return currentLayout;
}

export async function setLayout(id: string): Promise<LayoutRecord> {
  const layouts = await listLayouts();
  const requested = layouts.find(record => record.manifest.id === id);
  currentLayout = requested ?? selectCurrent(layouts);
  if (!requested) console.warn(`[layout] 找不到布局 "${id}"，已回退默认布局`);
  applyLayoutCss(currentLayout.manifest.id, currentLayout.cssText ?? null);
  setUIPref(PREF_KEY, currentLayout.manifest.id);
  listeners.forEach(listener => listener());
  return currentLayout;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateLayoutCache(): void {
  records = null;
}

onUIPrefChange(key => {
  if (key !== PREF_KEY || !records) return;
  const next = selectCurrent(records);
  if (next.manifest.id === currentLayout.manifest.id) return;
  currentLayout = next;
  applyLayoutCss(next.manifest.id, next.cssText ?? null);
  listeners.forEach(listener => listener());
});
