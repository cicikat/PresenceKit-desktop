/* ============================================================
 * StateEngine — 核心状态
 *
 * Phase-1: 已删除前端 mock 行为循环 (startBehaviorLoop / stopBehaviorLoop)
 * TODO: Phase-3 通过 WebSocket 接入后端 state_update 推送
 * ============================================================ */

export const MOODS = ['平静', '开心', '低落', '病娇', '分心', '生气', '惊讶'] as const;
export const FOCUSES = ['看你', '发呆', '想事情', '看屏幕', '看你打字', '偷看', '注意到了什么'] as const;
export const PRESENCES = ['active', 'idle', 'away'] as const;

export type Mood     = typeof MOODS[number];
export type Focus    = typeof FOCUSES[number];
export type Presence = typeof PRESENCES[number];
export type EngineMode = 'companion' | 'chat-only';
export type StateOwnership = 'backend-polled' | 'backend-pushed' | 'local-derived' | 'sensor-derived';

export interface EngineState {
  mood:              Mood;
  focus:             Focus;
  presence:          Presence;
  mode:              EngineMode;
  lastInteraction:   number;
  wantToSpeak:       boolean;
  behaviorId:        string | null;
  behaviorEndsAt:    number;
  bodyTiltOverride:  number;
  activity:          { id: string | null; text: string; arc: string; thinkingAboutEligible: boolean } | null;
}

export type BackendStateSource = 'mood-poll' | 'activity-poll' | 'state-update';
export interface BackendStatePatchBySource {
  'mood-poll': Pick<EngineState, 'mood'>;
  'activity-poll': Pick<EngineState, 'activity'>;
  'state-update': Partial<Pick<
    EngineState,
    'wantToSpeak' | 'behaviorId' | 'behaviorEndsAt' | 'bodyTiltOverride'
  >>;
}

/**
 * Current ownership contract. Future writers must use an entry point matching
 * the field owner instead of calling the internal patch helper.
 *
 * Sensor snapshots are intentionally not mirrored into EngineState yet.
 * SubStatus owns the current sensor-derived telemetry; a future presence
 * mirror needs a dedicated sensor entry point and an explicit ownership change.
 */
export const STATE_FIELD_OWNERSHIP: Record<keyof EngineState, StateOwnership> = {
  mood: 'backend-polled',
  focus: 'local-derived',
  presence: 'local-derived',
  mode: 'local-derived',
  lastInteraction: 'local-derived',
  wantToSpeak: 'backend-pushed',
  behaviorId: 'backend-pushed',
  behaviorEndsAt: 'backend-pushed',
  bodyTiltOverride: 'backend-pushed',
  activity: 'backend-polled',
};

/* mood 持续可感知信号 — 用于视觉动画 */
export const MOOD_TABLE: Record<string, any> = {
  '平静': { breathePeriod: 4200, breatheDepth: 0.022, blinkInterval: 4500, blinkJitter: 0.4,
            eyeFollow: 0.85, eyeDamping: 0.18, microDrift: 1.2,
            auraHue: 70,  auraIntensity: 0.32, reactionDelay: 0,   irregularity: 0.05, lidDroop: 0.0  },
  '开心': { breathePeriod: 3000, breatheDepth: 0.034, blinkInterval: 3800, blinkJitter: 0.45,
            eyeFollow: 0.92, eyeDamping: 0.14, microDrift: 2.0,
            auraHue: 60,  auraIntensity: 0.55, reactionDelay: 0,   irregularity: 0.10, lidDroop: 0.0  },
  '低落': { breathePeriod: 5800, breatheDepth: 0.030, blinkInterval: 5500, blinkJitter: 0.6,
            eyeFollow: 0.55, eyeDamping: 0.30, microDrift: 0.6,
            auraHue: 240, auraIntensity: 0.28, reactionDelay: 320, irregularity: 0.08, lidDroop: 0.35 },
  '病娇': { breathePeriod: 3400, breatheDepth: 0.026, blinkInterval: 8200, blinkJitter: 0.9,
            eyeFollow: 1.0,  eyeDamping: 0.10, microDrift: 0.4,
            auraHue: 10,  auraIntensity: 0.45, reactionDelay: 80,  irregularity: 0.65, lidDroop: 0.0  },
  '分心': { breathePeriod: 4400, breatheDepth: 0.022, blinkInterval: 4200, blinkJitter: 0.5,
            eyeFollow: 0.18, eyeDamping: 0.42, microDrift: 1.6,
            auraHue: 280, auraIntensity: 0.22, reactionDelay: 260, irregularity: 0.20, lidDroop: 0.15 },
  '生气': { breathePeriod: 2400, breatheDepth: 0.040, blinkInterval: 2800, blinkJitter: 0.3,
            eyeFollow: 0.70, eyeDamping: 0.12, microDrift: 2.8,
            auraHue: 8,   auraIntensity: 0.70, reactionDelay: 0,   irregularity: 0.45, lidDroop: 0.0  },
  '惊讶': { breathePeriod: 3000, breatheDepth: 0.035, blinkInterval: 8000, blinkJitter: 0.7,
            eyeFollow: 0.95, eyeDamping: 0.08, microDrift: 2.2,
            auraHue: 52,  auraIntensity: 0.55, reactionDelay: 0,   irregularity: 0.40, lidDroop: 0.0  },
};

export const FOCUS_TABLE: Record<string, any> = {
  '看你':        { lookTarget: 'mouse',        bodyTilt: 0,  lidExtra: 0.0,  particleType: null,      duration: null  },
  '发呆':        { lookTarget: 'idle-drift',   bodyTilt: -2, lidExtra: 0.12, particleType: null,      duration: null  },
  '想事情':      { lookTarget: 'down',         bodyTilt: -4, lidExtra: 0.25, particleType: 'thought', duration: 4000  },
  '看屏幕':      { lookTarget: 'screen-right', bodyTilt: 3,  lidExtra: 0.0,  particleType: null,      duration: 3500  },
  '看你打字':    { lookTarget: 'chat',         bodyTilt: 2,  lidExtra: 0.0,  particleType: null,      duration: null  },
  '偷看':        { lookTarget: 'mouse',        bodyTilt: 1,  lidExtra: 0.0,  particleType: 'glance',  duration: 900   },
  '注意到了什么': { lookTarget: 'screen-left',  bodyTilt: 4,  lidExtra: 0.0,  particleType: null,      duration: 1200  },
};

export const PRESENCE_TABLE: Record<string, any> = {
  'active': { opacity: 1.0,  scale: 1.0,  allowProactive: true,  allowBehavior: true,  position: 'free'      },
  'idle':   { opacity: 0.85, scale: 0.92, allowProactive: true,  allowBehavior: true,  position: 'free'      },
  'away':   { opacity: 0.45, scale: 0.78, allowProactive: false, allowBehavior: false, position: 'corner-bl' },
};

export class StateEngine {
  private listeners: Set<(s: EngineState) => void> = new Set();
  state: EngineState;
  private _focusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = {
      mood:             '平静',
      focus:            '看你',
      presence:         'active',
      mode:             'companion',
      lastInteraction:  Date.now(),
      wantToSpeak:      false,
      behaviorId:       null,
      behaviorEndsAt:   0,
      bodyTiltOverride: 0,
      activity:         null,
    };
  }

  subscribe(fn: (s: EngineState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() { for (const fn of this.listeners) fn(this.state); }
  get()  { return this.state; }

  private applyPatch(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  applyBackendState<Source extends BackendStateSource>(
    source: Source,
    patch: BackendStatePatchBySource[Source],
  ) {
    this.applyPatch(patch);
    // Preserve the existing mood-poll behavior: it refreshed an active
    // temporary focus timer, while activity polls did not.
    if (source === 'mood-poll') this.scheduleFocusReset();
  }

  setLocalFocus(focus: Focus) {
    this.applyPatch({ focus });
    this.scheduleFocusReset();
  }

  private scheduleFocusReset() {
    const foc = FOCUS_TABLE[this.state.focus];
    if (foc && foc.duration) {
      if (this._focusTimer) clearTimeout(this._focusTimer);
      this._focusTimer = setTimeout(() => {
        this.applyPatch({ focus: this._defaultFocusForMood() });
      }, foc.duration);
    }
  }

  private _defaultFocusForMood(): Focus {
    const m = this.state.mood;
    if (m === '分心') return '发呆';
    if (m === '低落') return '想事情';
    return '看你';
  }

  markInteraction() {
    this.state.lastInteraction = Date.now();
    if (this.state.presence !== 'active') this.applyPatch({ presence: 'active' });
  }

  setMode(mode: EngineMode) {
    this.applyPatch({ mode });
    if (mode === 'chat-only') this.setLocalFocus('看你打字');
  }
}
