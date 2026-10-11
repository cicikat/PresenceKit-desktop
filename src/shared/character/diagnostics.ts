/** CA-07 diagnostics: a desensitised snapshot of what the loaded model can and cannot do. No paths, no asset content. */
import type { CharacterPerformer } from './performer';
import type { BindingReport } from './toonMaterial';
import type { MappingReport } from '../../windows/room/morphController';
import { ALL_ROLES, LEG_ROLES, type BoneRole } from './humanoid';
import type { MotionStatus } from './motionLibrary';

export interface CharacterDiagnostics {
  schema: 1;
  roles: { resolved: number; total: number; missing: string[] };
  brokenLinks: string[];
  routes: { face: string; gaze: string; body: string };
  capability: Record<string, boolean>;
  standing: { verified: boolean; skippedGroups: string[]; missingLegs: string[] };
  idleMotionSafe: boolean;
  morphKeyCount: number;
  expressions?: { applied: string[]; unresolved: string[]; missingTargets: string[] };
  materials?: { applied: number; problems: { id: string; status: string }[] };
  /** Body parts the rig cannot support, with stable codes the UI can map to i18n keys. */
  degraded: BodyDegradation[];
  /** Degradation reasons from routing, standing pose and rig topology, in load order. */
  notes: string[];
  rig?: { id: string; version: number; convention: string; exportMode: string; cacheHit: boolean; errors: string[]; missingOptional: string[] };
  motions?: MotionStatus[];
}

export interface BodyDegradation {
  part: 'armL' | 'armR' | 'legs' | 'torso';
  /** Stable code: arm-drop-unavailable, no-legs, partial-legs, no-torso-anchor. */
  code: string;
  missing: string[];
}

/** Which natural-pose abilities are lost to missing bones. Never claims a calibration the rig cannot back. */
export function describeBodyDegradation(present: ReadonlySet<BoneRole>): BodyDegradation[] {
  const out: BodyDegradation[] = [];
  for (const [part, roles] of [['armL', ['upperArmL', 'lowerArmL']], ['armR', ['upperArmR', 'lowerArmR']]] as const) {
    const missing = roles.filter((r) => !present.has(r));
    if (missing.length) out.push({ part, code: 'arm-drop-unavailable', missing });
  }
  const legMissing = LEG_ROLES.filter((r) => !present.has(r));
  if (legMissing.length === LEG_ROLES.length) out.push({ part: 'legs', code: 'no-legs', missing: legMissing });
  else if (legMissing.length) out.push({ part: 'legs', code: 'partial-legs', missing: legMissing });
  const torso = (['hips', 'spine', 'chest'] as const).filter((r) => !present.has(r));
  if (torso.length) out.push({ part: 'torso', code: 'no-torso-anchor', missing: torso });
  return out;
}

export function buildCharacterDiagnostics(
  performer: CharacterPerformer,
  extra: { expressions?: MappingReport; materials?: BindingReport[]; motions?: MotionStatus[] } = {},
): CharacterDiagnostics {
  const present = performer.bones.presentRoles();
  const { routes, standing } = performer;
  const out: CharacterDiagnostics = {
    schema: 1,
    roles: { resolved: present.size, total: ALL_ROLES.length, missing: ALL_ROLES.filter((r) => !present.has(r)) },
    brokenLinks: [...performer.bones.brokenLinks],
    routes: { face: routes.face, gaze: routes.gaze, body: routes.body },
    capability: { ...performer.capability },
    standing: { verified: standing.verified, skippedGroups: [...standing.skippedGroups], missingLegs: [...standing.missingLegs] },
    idleMotionSafe: performer.idleMotionSafe,
    morphKeyCount: performer.morph.names().length,
    degraded: describeBodyDegradation(present),
    notes: [...routes.notes, ...standing.notes, ...performer.bones.warnings],
  };
  if (extra.expressions) out.expressions = { ...extra.expressions };
  const p = performer.rigProfile;
  out.rig = { id: p.id, version: p.version, convention: p.convention, exportMode: p.exportMode, cacheHit: p.cacheHit,
    errors: [...p.errors], missingOptional: [...p.missingOptional] };
  if (extra.motions) out.motions = extra.motions.map(m => ({ ...m, missingRoles: [...m.missingRoles] }));
  if (extra.materials) {
    out.materials = {
      applied: extra.materials.filter((m) => m.status === 'applied').length,
      problems: extra.materials.filter((m) => m.status !== 'applied').map((m) => ({ id: m.id, status: m.status })),
    };
  }
  return out;
}

let latest: CharacterDiagnostics | null = null;
const listeners = new Set<(d: CharacterDiagnostics | null) => void>();

/** Latest snapshot for the window that loaded the model; settings UI reads this instead of re-probing. */
export function publishCharacterDiagnostics(d: CharacterDiagnostics | null): void {
  latest = d;
  listeners.forEach((fn) => fn(d));
}
export const getCharacterDiagnostics = (): CharacterDiagnostics | null => latest;
export function subscribeCharacterDiagnostics(fn: (d: CharacterDiagnostics | null) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
/** Redacted, copy-pasteable report. */
export const formatCharacterDiagnostics = (d: CharacterDiagnostics): string => JSON.stringify(d, null, 2);
