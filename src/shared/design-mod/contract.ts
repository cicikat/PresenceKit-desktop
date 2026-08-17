import { validateLayout } from '../layout/loader';
import { validateTheme } from '../theme/loader';
import {
  DESIGN_MOD_LEGACY_SCHEMA_VERSION,
  DESIGN_MOD_SCHEMA_VERSION,
  type DesignModManifest,
  type NativeSurfaceManifest,
} from './types';

export const DESIGN_MOD_DEFAULT_ID = 'builtin-default';

export const DESIGN_COMPONENT_IDS = [
  'chat.ribbon',
  'chat.header',
  'chat.transcript',
  'chat.composer',
  'chat.sidebar.flow',
  'chat.sidebar.flow.now',
  'chat.sidebar.flow.timeline',
  'chat.sidebar.garden',
  'chat.sidebar.garden.visual',
  'chat.sidebar.garden.summary',
  'chat.sidebar.garden.controls',
  'chat.sidebar.diary',
  'chat.sidebar.diary.characters',
  'chat.sidebar.diary.entries',
  'chat.sidebar.status',
] as const;

export type DesignComponentId = typeof DESIGN_COMPONENT_IDS[number];

export interface DesignComponentDescriptor {
  id: DesignComponentId;
  singleton: true;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  suspendPolicy: 'pause-when-covered';
  parentId?: DesignComponentId;
}
export const DESIGN_COMPONENTS: readonly DesignComponentDescriptor[] = [
  { id: 'chat.ribbon', singleton: true, defaultSize: { width: 52, height: 600 }, minSize: { width: 44, height: 160 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.header', singleton: true, defaultSize: { width: 520, height: 96 }, minSize: { width: 220, height: 56 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.transcript', singleton: true, defaultSize: { width: 520, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.composer', singleton: true, defaultSize: { width: 520, height: 112 }, minSize: { width: 220, height: 72 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.flow', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.flow.now', parentId: 'chat.sidebar.flow', singleton: true, defaultSize: { width: 280, height: 160 }, minSize: { width: 180, height: 72 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.flow.timeline', parentId: 'chat.sidebar.flow', singleton: true, defaultSize: { width: 280, height: 200 }, minSize: { width: 180, height: 96 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.garden', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.garden.visual', parentId: 'chat.sidebar.garden', singleton: true, defaultSize: { width: 280, height: 260 }, minSize: { width: 180, height: 96 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.garden.summary', parentId: 'chat.sidebar.garden', singleton: true, defaultSize: { width: 280, height: 72 }, minSize: { width: 180, height: 48 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.garden.controls', parentId: 'chat.sidebar.garden', singleton: true, defaultSize: { width: 280, height: 48 }, minSize: { width: 180, height: 40 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.diary', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.diary.characters', parentId: 'chat.sidebar.diary', singleton: true, defaultSize: { width: 280, height: 64 }, minSize: { width: 180, height: 48 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.diary.entries', parentId: 'chat.sidebar.diary', singleton: true, defaultSize: { width: 280, height: 296 }, minSize: { width: 180, height: 96 }, suspendPolicy: 'pause-when-covered' },
  { id: 'chat.sidebar.status', singleton: true, defaultSize: { width: 280, height: 360 }, minSize: { width: 180, height: 120 }, suspendPolicy: 'pause-when-covered' },
];

export function isDesignComponentOwnershipConflict(first: DesignComponentId, second: DesignComponentId): boolean {
  return first === second || first.startsWith(`${second}.`) || second.startsWith(`${first}.`);
}

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

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validateNativeSurface(value: unknown, index: number, ids: Set<string>): string[] {
  if (!value || typeof value !== 'object') return [`nativeSurfaces[${index}] 必须是对象`];
  const surface = value as Partial<NativeSurfaceManifest>;
  const errors: string[] = [];
  if (!isSafeId(surface.id)) errors.push(`nativeSurfaces[${index}].id 必须是安全的单级名称`);
  else if (ids.has(surface.id)) errors.push(`nativeSurfaces[${index}].id 不能重复`);
  else ids.add(surface.id);
  if (surface.kind !== 'halo' && surface.kind !== 'island') errors.push(`nativeSurfaces[${index}].kind 必须是 halo 或 island`);
  if (!isSafeDesignPath(surface.entry, '.js')) errors.push(`nativeSurfaces[${index}].entry 必须是同包内的 .js 路径`);
  if (surface.style !== undefined && !isSafeDesignPath(surface.style, '.css')) errors.push(`nativeSurfaces[${index}].style 必须是同包内的 .css 路径`);
  if (surface.pointerMode !== 'passthrough' && surface.pointerMode !== 'interactive') errors.push(`nativeSurfaces[${index}].pointerMode 不受支持`);
  if (surface.zOrder !== 'owned' && surface.zOrder !== 'always-on-top') errors.push(`nativeSurfaces[${index}].zOrder 不受支持`);
  if (!surface.size || !isFinitePositive(surface.size.width) || !isFinitePositive(surface.size.height)) errors.push(`nativeSurfaces[${index}].size 必须是正数尺寸`);
  if (surface.kind === 'halo' && surface.pointerMode !== 'passthrough') errors.push(`nativeSurfaces[${index}] halo 必须是 passthrough`);
  if (surface.kind === 'halo' && surface.anchor !== undefined) errors.push(`nativeSurfaces[${index}] halo 不应设置 anchor`);
  if (surface.kind === 'island' && typeof surface.anchor !== 'string') errors.push(`nativeSurfaces[${index}] island 必须设置 anchor`);
  if (surface.anchor !== undefined && !['main.top', 'main.right', 'main.bottom', 'main.left'].includes(surface.anchor)) errors.push(`nativeSurfaces[${index}].anchor 不受支持`);
  if (surface.margin !== undefined) {
    const margin = surface.margin;
    const validMargin = isFiniteNonNegative(margin) || (typeof margin === 'object' && margin !== null
      && isFiniteNonNegative(margin.top) && isFiniteNonNegative(margin.right)
      && isFiniteNonNegative(margin.bottom) && isFiniteNonNegative(margin.left));
    if (!validMargin) errors.push(`nativeSurfaces[${index}].margin 必须是非负数或四边非负数`);
  }
  if (surface.offset !== undefined && (!surface.offset || !isFinite(surface.offset.x ?? 0) || !isFinite(surface.offset.y ?? 0))) errors.push(`nativeSurfaces[${index}].offset 必须是有限数值`);
  if (surface.requires !== undefined && (!Array.isArray(surface.requires) || surface.requires.some(item => !isSafeId(item)))) errors.push(`nativeSurfaces[${index}].requires 必须是安全能力名称数组`);
  return errors;
}

export function validateDesignModManifest(value: unknown, expectedId?: string): string[] {
  if (!value || typeof value !== 'object') return ['manifest 必须是对象'];
  const candidate = value as Partial<DesignModManifest>;
  const errors: string[] = [];
  if (candidate.schemaVersion !== DESIGN_MOD_SCHEMA_VERSION && candidate.schemaVersion !== DESIGN_MOD_LEGACY_SCHEMA_VERSION) errors.push('schemaVersion 必须是 1 或 2');
  if (!isSafeId(candidate.id)) errors.push('id 必须是安全的单级目录名');
  if (expectedId && candidate.id !== expectedId) errors.push('id 必须与设计 Mod 目录名一致');
  for (const key of ['name', 'author', 'version'] as const) {
    if (typeof candidate[key] !== 'string' || !candidate[key]) errors.push(`${key} 必须是非空字符串`);
  }
  if (!isSafeDesignPath(candidate.entry, '.js')) errors.push('entry 必须是同包内的 .js 路径');
  if (candidate.style !== undefined && !isSafeDesignPath(candidate.style, '.css')) errors.push('style 必须是同包内的 .css 路径');
  if (candidate.theme !== undefined && !isSafeDesignPath(candidate.theme, '.json')) errors.push('theme 必须是同包内的 .json 路径');
  if (candidate.layout !== undefined && !isSafeDesignPath(candidate.layout, '.json')) errors.push('layout 必须是同包内的 .json 路径');
  if (candidate.nativeSurfaces !== undefined) {
    if (candidate.schemaVersion !== DESIGN_MOD_SCHEMA_VERSION) errors.push('nativeSurfaces 需要 schemaVersion 2');
    if (!Array.isArray(candidate.nativeSurfaces)) errors.push('nativeSurfaces 必须是数组');
    else {
      const ids = new Set<string>();
      candidate.nativeSurfaces.forEach((surface, index) => errors.push(...validateNativeSurface(surface, index, ids)));
    }
  }
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
