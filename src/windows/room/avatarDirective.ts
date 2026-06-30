import type { DesktopActionPayload } from '../../shared/api/types';
import { wsClient } from '../../shared/api/ws';

const VALID_EXPRESSIONS = new Set([
  'neutral', 'gentle', 'thinking', 'happy', 'sad',
  'surprised', 'angry', 'sleepy', 'yandere',
]);

const VALID_GAZE_MODES = new Set(['user', 'away', 'point', 'idle']);
const VALID_GESTURES = new Set(['nod', 'tilt', 'lean_in', 'shake']);

export type GazeMode = 'user' | 'away' | 'point' | 'idle';

export interface GazeDirective {
  mode: GazeMode;
  x: number;
  y: number;
}

export type GestureType = 'nod' | 'tilt' | 'lean_in' | 'shake';

export interface AvatarDirective {
  expression: string | null;
  intensity: number;
  gaze: GazeDirective | null;
  gesture: GestureType | null;
  speaking: boolean | null;
  ttl_ms: number;
}

export interface ActiveDirective extends AvatarDirective {
  receivedAt: number;
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

  const speaking = typeof raw.speaking === 'boolean' ? raw.speaking : null;
  const ttl_ms = clampNum(raw.ttl_ms, 100, 30_000, 3_000);

  return { expression, intensity, gaze, gesture, speaking, ttl_ms };
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
    _active = { ...validate(action), receivedAt: performance.now() };
  });
}
