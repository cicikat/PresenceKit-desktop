/** CA-07 diagnostics: a desensitised snapshot of what the loaded model can and cannot do. No paths, no asset content. */
import type { CharacterPerformer } from './performer';
import type { BindingReport } from './toonMaterial';
import type { MappingReport } from '../../windows/room/morphController';
import { ALL_ROLES } from './humanoid';

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
  /** Degradation reasons from routing, standing pose and rig topology, in load order. */
  notes: string[];
}

export function buildCharacterDiagnostics(
  performer: CharacterPerformer,
  extra: { expressions?: MappingReport; materials?: BindingReport[] } = {},
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
    notes: [...routes.notes, ...standing.notes, ...performer.bones.warnings],
  };
  if (extra.expressions) out.expressions = { ...extra.expressions };
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
