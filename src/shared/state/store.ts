/* ============================================================
 * StateEngine — 核心状态
 *
 * Phase-1: 已删除前端 mock 行为循环 (startBehaviorLoop / stopBehaviorLoop)
 * TODO: Phase-3 通过 WebSocket 接入后端 state_update 推送
 * ============================================================ */

export const MOODS = ['平静', '开心', '低落', '病娇', '分心'] as const;
export const ACTIVITIES = ['看你', '发呆', '想事情', '看屏幕', '看你打字', '偷看', '注意到了什么'] as const;
export const PRESENCES = ['active', 'idle', 'away'] as const;

export type Mood     = typeof MOODS[number];
export type Activity = typeof ACTIVITIES[number];
export type Presence = typeof PRESENCES[number];

export interface EngineState {
  mood:              Mood;
  activity:          Activity;
  presence:          Presence;
  mode:              'companion' | 'chat-only';
  lastInteraction:   number;
  wantToSpeak:       boolean;
  behaviorId:        string | null;
  behaviorEndsAt:    number;
  bodyTiltOverride:  number;
}

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
};

export const ACTIVITY_TABLE: Record<string, any> = {
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
  private _activityTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.state = {
      mood:             '平静',
      activity:         '看你',
      presence:         'active',
      mode:             'companion',
      lastInteraction:  Date.now(),
      wantToSpeak:      false,
      behaviorId:       null,
      behaviorEndsAt:   0,
      bodyTiltOverride: 0,
    };
  }

  subscribe(fn: (s: EngineState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() { for (const fn of this.listeners) fn(this.state); }
  get()  { return this.state; }

  set(patch: Partial<EngineState>, opts: { userInteraction?: boolean } = {}) {
    this.state = { ...this.state, ...patch };
    this.emit();
    if (opts.userInteraction) this.markInteraction();
  }

  // TODO: Phase-3 WebSocket — 后端推送 state_update 时调此方法
  applyStateUpdate(update: Partial<EngineState>) {
    const patch: Partial<EngineState> = {};
    if (update.mood       !== undefined) patch.mood       = update.mood;
    if (update.activity   !== undefined) patch.activity   = update.activity;
    if (update.presence   !== undefined) patch.presence   = update.presence;
    if (update.wantToSpeak !== undefined) patch.wantToSpeak = update.wantToSpeak;
    this.set(patch);

    const act = ACTIVITY_TABLE[this.state.activity];
    if (act && act.duration) {
      if (this._activityTimer) clearTimeout(this._activityTimer);
      this._activityTimer = setTimeout(() => {
        this.set({ activity: this._defaultActivityForMood() });
      }, act.duration);
    }
  }

  private _defaultActivityForMood(): Activity {
    const m = this.state.mood;
    if (m === '分心') return '发呆';
    if (m === '低落') return '想事情';
    return '看你';
  }

  markInteraction() {
    this.state.lastInteraction = Date.now();
    if (this.state.presence !== 'active') this.set({ presence: 'active' });
  }

  setMode(mode: 'companion' | 'chat-only') {
    this.set({ mode });
    if (mode === 'chat-only') this.set({ activity: '看你打字' });
  }
}
