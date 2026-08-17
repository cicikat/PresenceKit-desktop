import { validateLayout } from '../layout/loader';
import { validateTheme } from '../theme/loader';
import { DESIGN_MOD_SCHEMA_VERSION, type DesignModManifest } from './types';

export const DESIGN_MOD_DEFAULT_ID = 'builtin-default';

export const DESIGN_COMPONENT_IDS = [
  'chat.ribbon',
  'chat.header',
  'chat.transcript',
  'chat.composer',
  'chat.sidebar.flow',
  'chat.sidebar.garden',
  'chat.sidebar.diary',
  'chat.sidebar.status',
] as const;

export type DesignComponentId = typeof DESIGN_COMPONENT_IDS[number];

export interface DesignComponentDescriptor {
  id: DesignComponentId;
  singleton: true;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  suspendPolicy: 'pause-when-covered';
}
export const DESIGN_COMPONENTS: readonly DesignComponentDescriptor[] = [
  { id: 'chat.ribbon', singleton: true, defaultSize: { width: 52, height: 600 }, minSize: { width: 44, height: 160 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.header', singleton: true, defaultSize: { width: 520, height: 96 }, minSize: { width: 220, height: 56 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.transcript', singleton: true, defaultSize: { width: 520, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.composer', singleton: true, defaultSize: { width: 520, height: 112 }, minSize: { width: 220, height: 72 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.flow', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.garden', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.diary', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.status', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
];

export function isSafeDesignPath(value: unknown, extension?: string): value is string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')) return false;
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return false;
  if (extension && !value.toLowerCase().endsWith(extension)) return false;
  return true;
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(value);
}

export function validateDesignModManifest(value: unknown, expectedId?: string): string[] {
  if (!value || typeof value !== 'object') return ['manifest 必须是对象'];
  const candidate = value as Partial<DesignModManifest>;
  const errors: string[] = [];
  if (candidate.schemaVersion !== DESIGN_MOD_SCHEMA_VERSION) errors.push('schemaVersion 必须是 1');
  if (!isSafeId(candidate.id)) errors.push('id 必须是安全的单级目录名');
  if (expectedId && candidate.id !== expectedId) errors.push('id 必须与设计 Mod 目录名一致');
  for (const key of ['name', 'author', 'version'] as const) {
    if (typeof candidate[key] !== 'string' || !candidate[key]) errors.push(`${key} 必须是非空字符串`);
  }
  if (!isSafeDesignPath(candidate.entry, '.js')) errors.push('entry 必须是同包内的 .js 路径');
  if (candidate.style !== undefined && !isSafeDesignPath(candidate.style, '.css')) errors.push('style 必须是同包内的 .css 路径');
  if (candidate.theme !== undefined && !isSafeDesignPath(candidate.theme, '.json')) errors.push('theme 必须是同包内的 .json 路径');
  if (candidate.layout !== undefined && !isSafeDesignPath(candidate.layout, '.json')) errors.push('layout 必须是同包内的 .json 路径');
  return errors;
}

export function validateDesignModPackage(
  manifest: unknown,
  options: { expectedId?: string; theme?: unknown; themeCssError?: string; layout?: unknown; layoutCssError?: string } = {},
): string[] {
  const errors = validateDesignModManifest(manifest, options.expectedId);
  const candidate = manifest as Partial<DesignModManifest>;
  if (candidate.theme && options.theme !== undefined) {
    const themeErrors = validateTheme(options.theme as never);
    errors.push(...themeErrors.map(error => `theme: ${error}`));
  }
  if (options.themeCssError) errors.push(`theme.css: ${options.themeCssError}`);
  if (candidate.layout && options.layout !== undefined) {
    const layoutErrors = validateLayout(options.layout);
    errors.push(...layoutErrors.map(error => `layout: ${error}`));
  }
  if (options.layoutCssError) errors.push(`layout.css: ${options.layoutCssError}`);
  return errors;
}

export function selectDesignMod(records: readonly { manifest: { id: string } }[], requestedId: string | null | undefined) {
  return records.find(record => record.manifest.id === requestedId)
    ?? records.find(record => record.manifest.id === DESIGN_MOD_DEFAULT_ID)
    ?? null;
}
