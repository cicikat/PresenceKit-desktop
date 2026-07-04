import type { DesktopActionPayload, PerformSpec } from '../../shared/api/types';
import { wsClient } from '../../shared/api/ws';

const VALID_EXPRESSIONS = new Set([
  'neutral', 'gentle', 'thinking', 'happy', 'sad',
  'surprised', 'angry', 'sleepy', 'yandere',
]);

const VALID_GAZE_MODES = new Set(['user', 'away', 'point', 'idle']);
// `tilt` is kept as an alias for `tilt_r` — the WS avatar_directive vocabulary predates the
// sentence-level performance layer and still only speaks the old word.
const VALID_GESTURES = new Set(['nod', 'tilt', 'tilt_l', 'tilt_r', 'lean_in', 'shake', 'dip']);
const VALID_POSTURES = new Set(['lean_in', 'lean_back', 'shrink', 'straighten']);

export type GazeMode = 'user' | 'away' | 'point' | 'idle';

export interface GazeDirective {
  mode: GazeMode;
  x: number;
  y: number;
}

export type GestureType = 'nod' | 'tilt' | 'tilt_l' | 'tilt_r' | 'lean_in' | 'shake' | 'dip';
export type PostureType = 'lean_in' | 'lean_back' | 'shrink' | 'straighten';

export interface AvatarDirective {
  expression: string | null;
  intensity: number;
  gaze: GazeDirective | null;
  gesture: GestureType | null;
  posture: PostureType | null;
  speaking: boolean | null;
  energy: number;
  ttl_ms: number;
}

export interface ActiveDirective extends AvatarDirective {
  receivedAt: number;
  origin: 'ws' | 'local';
}

let _active: ActiveDirective | null = null;

function clampNum(v: unknown, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' ? v : def;
  return Math.max(lo, Math.min(hi, isFinite(n) ? n : def));
}

function validate(raw: DesktopActionPayload): AvatarDirective {
  const exprRaw = typeof raw.expression === 'string' ? raw.expression : null;
  const expression = exprRaw && VALID_EXPRESSIONS.has(exprRaw) ? exprRaw : null;

  const intensity = clampNum(raw.intensity, 0, 1, 0.6);

  let gaze: GazeDirective | null = null;
  if (raw.gaze !== null && raw.gaze !== undefined && typeof raw.gaze === 'object' && !Array.isArray(raw.gaze)) {
    const g = raw.gaze as Record<string, unknown>;
    const modeRaw = typeof g.mode === 'string' ? g.mode : 'idle';
    const mode: GazeMode = VALID_GAZE_MODES.has(modeRaw) ? (modeRaw as GazeMode) : 'idle';
    gaze = {
      mode,
      x: clampNum(g.x, -1, 1, 0),
      y: clampNum(g.y, -1, 1, 0),
    };
  }

  const gestureRaw = typeof raw.gesture === 'string' ? raw.gesture : null;
  const gesture: GestureType | null =
    gestureRaw && VALID_GESTURES.has(gestureRaw) ? (gestureRaw as GestureType) : null;

  // WS avatar_directive (mood baseline / insert) doesn't send posture/energy today —
  // default to "no override" / neutral so the execution layer falls back cleanly.
  const postureRaw = typeof raw.posture === 'string' ? raw.posture : null;
  let posture: PostureType | null =
    postureRaw && VALID_POSTURES.has(postureRaw) ? (postureRaw as PostureType) : null;
  // Legacy WS vocabulary compat: `lean_in` used to be a gesture (body lean lived in the
  // gesture layer pre-Brief-12). The execution layer now only leans via posture, so an
  // old-style directive with gesture=lean_in and no posture must translate or the lean
  // silently disappears.
  if (gesture === 'lean_in' && posture === null) posture = 'lean_in';
  const energy = clampNum(raw.energy, 0, 1, 0.5);

  const speaking = typeof raw.speaking === 'boolean' ? raw.speaking : null;
  const ttl_ms = clampNum(raw.ttl_ms, 100, 30_000, 3_000);

  return { expression, intensity, gaze, gesture, posture, speaking, energy, ttl_ms };
}

export function getActiveDirective(now: number): ActiveDirective | null {
  if (!_active) return null;
  if (now - _active.receivedAt > _active.ttl_ms) {
    _active = null;
    return null;
  }
  return _active;
}

export function setupAvatarDirectiveListener(): () => void {
  return wsClient.on('action', (action) => {
    if (action.type !== 'avatar_directive') return;
    _active = { ...validate(action), receivedAt: performance.now(), origin: 'ws' };
  });
}

// ── local (sentence-level) performance injection — VN presenter calls these directly, no WS ──

function gazeFromPerform(gaze: PerformSpec['gaze']): GazeDirective | null {
  switch (gaze) {
    case 'user': return { mode: 'user', x: 0, y: 0 };
    case 'away': return { mode: 'away', x: 0, y: 0 };
    case 'down': return { mode: 'point', x: 0, y: -0.7 };
    case 'wander': return { mode: 'idle', x: 0, y: 0 };
    default: return null;
  }
}

/** Fixed TTL for locally-injected performance — the presenter's own set/clear calls own the
 * real lifecycle (advancing to the next segment, turn fade-out); this is just a safety net so
 * a missed clearLocalPerform() call can't pin a pose forever. */
const LOCAL_PERFORM_TTL_MS = 30_000;

export function setLocalPerform(spec: PerformSpec): void {
  const expression = spec.expression && VALID_EXPRESSIONS.has(spec.expression) ? spec.expression : null;
  const intensity = clampNum(spec.intensity, 0, 1, 0.6);
  const gesture = spec.head && VALID_GESTURES.has(spec.head) ? (spec.head as GestureType) : null;
  const posture = spec.posture && VALID_POSTURES.has(spec.posture) ? (spec.posture as PostureType) : null;
  const gaze = gazeFromPerform(spec.gaze);
  const energy = clampNum(spec.energy, 0, 1, 0.5);

  _active = {
    expression, intensity, gaze, gesture, posture, energy,
    speaking: null, // speaking continues to be driven by the VN talking prop
    ttl_ms: LOCAL_PERFORM_TTL_MS,
    receivedAt: performance.now(),
    origin: 'local',
  };
}

export function clearLocalPerform(): void {
  if (_active?.origin === 'local') _active = null;
}
