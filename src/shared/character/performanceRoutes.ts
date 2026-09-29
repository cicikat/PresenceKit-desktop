/**
 * CA-02/03/04 performance routing. Decides, per character, which driver owns each
 * performance dimension so that every property has exactly one final writer
 * (the invariant required by the package contract's frame-order rules).
 *
 * A model may carry morph targets, face/eye bones, or both. `auto` resolves from
 * probed model capability; an explicit route pins the decision when the user
 * disagrees with the probe. Blink and mouth are deliberately NOT routable — they
 * must always be able to close/open, so a face route never suppresses them.
 */

export type FaceRoute = 'auto' | 'morph' | 'bone' | 'off';
export type GazeRoute = 'auto' | 'morph' | 'bone' | 'mixed' | 'off';
export type BodyRoute = 'auto' | 'procedural' | 'clip' | 'off';

export interface PerformanceRoutes {
  face?: FaceRoute;
  gaze?: GazeRoute;
  body?: BodyRoute;
}

/** What the loaded model can actually do. Probed from the model, never from config. */
export interface RigCapability {
  /** Expression morph keys present (from MOOD_MORPHS / EXPR_KEYS namespace). */
  expressionMorphs: boolean;
  /** `eyeLookLeft/Right/Up/Down` — at least one present. */
  gazeMorphs: boolean;
  /** Both eye bones resolved. A single eye bone is not enough to drive symmetric gaze. */
  eyeBones: boolean;
  /** Any facial deform bone beyond the eyes (jaw/brow/cheek/mouth). */
  faceBones: boolean;
  /** A usable idle clip was selected. */
  idleClip: boolean;
  /** Head bone resolved — required for gaze compensation when eyes cannot move. */
  headBone: boolean;
}

export type ResolvedFace = 'morph' | 'bone' | 'morph+bone' | 'off';
export type ResolvedGaze = 'morph' | 'bone' | 'mixed' | 'headOnly' | 'off';
export type ResolvedBody = 'procedural' | 'clip+procedural' | 'clip' | 'off';

export interface ResolvedRoutes {
  face: ResolvedFace;
  gaze: ResolvedGaze;
  body: ResolvedBody;
  /** Human-readable reasons a dimension degraded or was disabled. i18n happens at the UI edge. */
  notes: string[];
}

export const DEFAULT_ROUTES: Required<PerformanceRoutes> = { face: 'auto', gaze: 'auto', body: 'auto' };

const FACE_ROUTES: readonly FaceRoute[] = ['auto', 'morph', 'bone', 'off'];
const GAZE_ROUTES: readonly GazeRoute[] = ['auto', 'morph', 'bone', 'mixed', 'off'];
const BODY_ROUTES: readonly BodyRoute[] = ['auto', 'procedural', 'clip', 'off'];

export function validatePerformanceRoutes(raw: unknown): PerformanceRoutes | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: PerformanceRoutes = {};
  if (FACE_ROUTES.includes(r.face as FaceRoute) && r.face !== 'auto') out.face = r.face as FaceRoute;
  if (GAZE_ROUTES.includes(r.gaze as GazeRoute) && r.gaze !== 'auto') out.gaze = r.gaze as GazeRoute;
  if (BODY_ROUTES.includes(r.body as BodyRoute) && r.body !== 'auto') out.body = r.body as BodyRoute;
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveFace(route: FaceRoute, cap: RigCapability, notes: string[]): ResolvedFace {
  if (route === 'off') return 'off';
  if (route === 'morph') {
    if (cap.expressionMorphs) return 'morph';
    notes.push('face=morph requested but the model has no expression morph keys');
    return 'off';
  }
  if (route === 'bone') {
    if (cap.faceBones) return 'bone';
    notes.push('face=bone requested but no facial deform bones were mapped');
    return 'off';
  }
  // auto: morphs lead; face bones layer on top of them rather than competing.
  if (cap.expressionMorphs && cap.faceBones) return 'morph+bone';
  if (cap.expressionMorphs) return 'morph';
  if (cap.faceBones) return 'bone';
  notes.push('no expression morph keys or facial bones; expressions are unavailable');
  return 'off';
}

function resolveGaze(route: GazeRoute, cap: RigCapability, notes: string[]): ResolvedGaze {
  if (route === 'off') return 'off';
  if (route === 'morph') {
    if (cap.gazeMorphs) return 'morph';
    notes.push('gaze=morph requested but the model has no eyeLook* morph keys');
    return cap.headBone ? 'headOnly' : 'off';
  }
  if (route === 'bone') {
    if (cap.eyeBones) return 'bone';
    notes.push('gaze=bone requested but both eye bones were not resolved');
    return cap.gazeMorphs ? 'morph' : cap.headBone ? 'headOnly' : 'off';
  }
  if (route === 'mixed') {
    if (cap.eyeBones && cap.gazeMorphs) return 'mixed';
    notes.push('gaze=mixed requires both eye bones and eyeLook* morph keys');
    return cap.eyeBones ? 'bone' : cap.gazeMorphs ? 'morph' : cap.headBone ? 'headOnly' : 'off';
  }
  // auto: bones are the higher-fidelity driver; never combine implicitly, that double-applies.
  if (cap.eyeBones) return 'bone';
  if (cap.gazeMorphs) return 'morph';
  if (cap.headBone) {
    notes.push('no eye bones or eyeLook* morph keys; gaze falls back to head turn only');
    return 'headOnly';
  }
  notes.push('no eye bones, eyeLook* morph keys or head bone; gaze is unavailable');
  return 'off';
}

function resolveBody(route: BodyRoute, cap: RigCapability, notes: string[]): ResolvedBody {
  if (route === 'off') return 'off';
  if (route === 'clip') {
    if (cap.idleClip) return 'clip';
    notes.push('body=clip requested but the model has no usable idle clip');
    return 'procedural';
  }
  if (route === 'procedural') return 'procedural';
  // auto preserves today's behavior: procedural breath/shoulder layered over a clip if present.
  return cap.idleClip ? 'clip+procedural' : 'procedural';
}

/**
 * Pure resolution of stored routes against probed capability. Callers pass the
 * per-character override (possibly undefined); `auto` and absent behave identically.
 */
export function resolveRoutes(
  routes: PerformanceRoutes | undefined,
  cap: RigCapability,
): ResolvedRoutes {
  const notes: string[] = [];
  return {
    face: resolveFace(routes?.face ?? 'auto', cap, notes),
    gaze: resolveGaze(routes?.gaze ?? 'auto', cap, notes),
    body: resolveBody(routes?.body ?? 'auto', cap, notes),
    notes,
  };
}

/** Whether the resolved gaze plan should write eyeLook* morph keys this frame. */
export const gazeUsesMorphs = (gaze: ResolvedGaze): boolean => gaze === 'morph' || gaze === 'mixed';
/** Whether the resolved gaze plan should rotate eye bones this frame. */
export const gazeUsesBones = (gaze: ResolvedGaze): boolean => gaze === 'bone' || gaze === 'mixed';
/** Whether expression morph keys are written this frame. */
export const faceUsesMorphs = (face: ResolvedFace): boolean => face === 'morph' || face === 'morph+bone';
