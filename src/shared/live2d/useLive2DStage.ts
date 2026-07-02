import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
// IMPORTANT: pixi-live2d-display/cubism4 must NOT be statically imported — its module body
// throws "Could not find Cubism 4 runtime" when window.Live2DCubismCore is absent, which
// kills the entire bundle at startup (main.tsx imports this file transitively via RoomWindow).
// It is loaded lazily via loadCubism4() below, strictly AFTER ensureCubismCore().
// eslint-disable-next-line import/no-unresolved -- subpath export, resolved via package.json "exports"
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import { ensureCubismCore } from './cubismCore';
import { listLive2DModels } from './live2dAssets';
import {
  loadLive2DSettings,
  subscribeLive2DSettings,
  type Live2DSettings,
} from './live2dSettings';
import { MOOD_TO_EXPRESSION, MOOD_PARAMS, matchExpressionName } from './live2dExpressions';
import { MOOD_TABLE } from '../state/store';
import type { Mood } from '../state/store';
import { backendMoodToFrontend } from '../state/mood-mapping';
import { getActiveDirective } from '../../windows/room/avatarDirective';
import { microNoise } from '../../windows/room/boneResolver';

// pixi-live2d-display's Cubism4 core model type isn't exported from the package's public
// entry point — treated as `any` throughout this file. // TODO: type
type CoreModel = any; // eslint-disable-line @typescript-eslint/no-explicit-any

type Cubism4Module = typeof import('pixi-live2d-display/cubism4');

let cubism4: Cubism4Module | null = null;
let cubism4Promise: Promise<Cubism4Module> | null = null;

/** Inject the Cubism core script first, then (once) evaluate the cubism4 module. */
async function loadCubism4(): Promise<Cubism4Module> {
  await ensureCubismCore();
  if (!cubism4Promise) {
    cubism4Promise = import('pixi-live2d-display/cubism4').then(m => {
      m.Live2DModel.registerTicker(PIXI.Ticker as unknown as Parameters<typeof m.Live2DModel.registerTicker>[0]);
      cubism4 = m;
      return m;
    });
    cubism4Promise.catch(() => { cubism4Promise = null; });
  }
  return cubism4Promise;
}

const ALL_PARAM_KEYS: readonly string[] = Array.from(
  new Set(Object.values(MOOD_PARAMS).flatMap(p => Object.keys(p))),
);

interface BlinkState {
  phase: 'idle' | 'blink';
  nextAt: number;
  startedAt: number;
}

function scheduleNextBlink(state: BlinkState, mood: Mood, now: number): void {
  const entry = MOOD_TABLE[mood];
  const interval = (entry?.blinkInterval ?? 4500) as number;
  const jitter = (entry?.blinkJitter ?? 0.4) as number;
  const variation = (Math.random() * 2 - 1) * jitter * interval;
  state.nextAt = now + Math.max(500, interval + variation);
  state.phase = 'idle';
}

function getBlinkPulse(state: BlinkState, now: number, mood: Mood): number {
  if (state.phase === 'idle' && now >= state.nextAt) {
    state.phase = 'blink';
    state.startedAt = now;
  }
  if (state.phase === 'blink') {
    const HALF = 60;
    const elapsed = now - state.startedAt;
    if (elapsed < HALF) return elapsed / HALF;
    if (elapsed < HALF * 2) return 1 - (elapsed - HALF) / HALF;
    scheduleNextBlink(state, mood, now);
    return 0;
  }
  return 0;
}

function lerp(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

function getParamIndex(coreModel: CoreModel, id: string): number {
  try {
    return coreModel.getParameterIndex(id) as number;
  } catch {
    return -1;
  }
}

function setParam(coreModel: CoreModel, id: string, value: number): void {
  const idx = getParamIndex(coreModel, id);
  if (idx === -1) return;
  coreModel.setParameterValueByIndex(idx, value);
}

function getParamValue(coreModel: CoreModel, id: string): number | null {
  const idx = getParamIndex(coreModel, id);
  if (idx === -1) return null;
  try {
    return coreModel.getParameterValueByIndex(idx) as number;
  } catch {
    return null;
  }
}

export interface UseLive2DStageOptions {
  getMood: () => Mood;
  getTalking: () => boolean;
  getVolume?: () => number;
  transparent: boolean;
  zoom?: number;
}

export interface UseLive2DStageResult {
  error: string | null;
  /** Fires a one-shot decaying pose pulse (pet mouse-reaction feedback), e.g. `pulse('shy')`. */
  pulse: (kind: 'shy' | 'nuzzle') => void;
}

export function useLive2DStage(
  mountRef: React.RefObject<HTMLDivElement | null>,
  opts: UseLive2DStageOptions,
): UseLive2DStageResult {
  const [error, setError] = useState<string | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }, [opts]);

  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<InstanceType<typeof Live2DModel> | null>(null);
  const bgSpriteRef = useRef<PIXI.Sprite | null>(null);
  const settingsRef = useRef<Live2DSettings>(loadLive2DSettings());
  const baseScaleRef = useRef(1);
  const loadTokenRef = useRef(0);

  const blinkStateRef = useRef<BlinkState>({ phase: 'idle', nextAt: performance.now() + 2000, startedAt: 0 });
  const mouthValueRef = useRef(0);
  const gazeAngleXRef = useRef(0);
  const gazeAngleYRef = useRef(0);
  const eyeBallXRef = useRef(0);
  const eyeBallYRef = useRef(0);
  const leanScaleRef = useRef(1);
  const paramStateRef = useRef<Map<string, number>>(new Map());
  const lastExpressionRef = useRef<string | null>(null);
  const lastMotionMoodRef = useRef<Mood | null>(null);
  const reactionPulseRef = useRef<{ kind: 'shy' | 'nuzzle'; startedAt: number } | null>(null);
  const pulse = useRef((kind: 'shy' | 'nuzzle') => {
    reactionPulseRef.current = { kind, startedAt: performance.now() };
  }).current;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;

    const app = new PIXI.Application({
      resizeTo: mount,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: true,
    });
    appRef.current = app;
    mount.appendChild(app.view as HTMLCanvasElement);

    function isForceTransparent(): boolean {
      return optsRef.current.transparent;
    }

    function applyBackground(settings: Live2DSettings): void {
      const a = appRef.current;
      if (!a) return;
      const transparent = isForceTransparent() || settings.bgKind === 'transparent';

      if (bgSpriteRef.current) {
        a.stage.removeChild(bgSpriteRef.current);
        bgSpriteRef.current.destroy({ children: true, texture: true, baseTexture: true });
        bgSpriteRef.current = null;
      }

      if (transparent) {
        a.renderer.backgroundAlpha = 0;
        return;
      }

      if (settings.bgKind === 'color') {
        a.renderer.backgroundAlpha = 1;
        const parsed = parseInt(settings.bgColor.replace('#', ''), 16);
        if (Number.isFinite(parsed)) a.renderer.backgroundColor = parsed;
        return;
      }

      if (settings.bgKind === 'image' && settings.bgImage) {
        a.renderer.backgroundAlpha = 1;
        PIXI.Texture.fromURL(settings.bgImage)
          .then(texture => {
            if (disposed || settingsRef.current.bgImage !== settings.bgImage) return;
            const sprite = new PIXI.Sprite(texture);
            const { clientWidth: w, clientHeight: h } = mount;
            const scale = Math.max(w / texture.width, h / texture.height) || 1;
            sprite.width = texture.width * scale;
            sprite.height = texture.height * scale;
            sprite.anchor.set(0.5);
            sprite.x = w / 2;
            sprite.y = h / 2;
            a.stage.addChildAt(sprite, 0);
            bgSpriteRef.current = sprite;
          })
          .catch(() => { /* missing bg image: fall back to plain background color */ });
      }
    }

    function applyLayout(): void {
      const model = modelRef.current;
      if (!model) return;
      const { clientWidth: w, clientHeight: h } = mount;
      if (w === 0 || h === 0) return;
      const settings = settingsRef.current;
      const zoom = optsRef.current.zoom ?? 1;
      const baseH = (model.internalModel?.height as number | undefined) || model.height || 1;
      const targetH = h * 0.95 * settings.scaleMul * zoom;
      const scale = targetH / baseH;
      baseScaleRef.current = scale;
      model.scale.set(scale, scale);
      model.x = w / 2 + settings.offset[0] * w;
      model.y = h / 2 + settings.offset[1] * h;
    }

    async function loadModel(dir: string): Promise<void> {
      const token = ++loadTokenRef.current;
      if (modelRef.current) {
        app.stage.removeChild(modelRef.current);
        modelRef.current.destroy();
        modelRef.current = null;
      }
      lastExpressionRef.current = null;
      lastMotionMoodRef.current = null;
      paramStateRef.current.clear();

      if (!dir) {
        setError('还没有选择 Live2D 模型：请在设置里选择，或把模型放到 public/live2d/models/<模型名>/');
        return;
      }

      let Live2DModelCtor: Cubism4Module['Live2DModel'];
      try {
        ({ Live2DModel: Live2DModelCtor } = await loadCubism4());
      } catch (e) {
        if (token !== loadTokenRef.current || disposed) return;
        setError(e instanceof Error ? e.message : String(e));
        return;
      }

      let modelJson: string | null = null;
      try {
        const assets = await listLive2DModels();
        modelJson = assets.find(a => a.dirName === dir)?.modelJson ?? null;
      } catch {
        modelJson = null;
      }
      if (token !== loadTokenRef.current || disposed) return;
      if (!modelJson) {
        setError(`模型目录 public/live2d/models/${dir}/ 内未找到 *.model3.json`);
        return;
      }

      try {
        const url = `/live2d/models/${encodeURIComponent(dir)}/${encodeURIComponent(modelJson)}`;
        const model = await Live2DModelCtor.from(url, {
          idleMotionGroup: settingsRef.current.idleMotionGroup || undefined,
          autoInteract: false,
        });
        if (token !== loadTokenRef.current || disposed) {
          model.destroy();
          return;
        }
        model.anchor.set(0.5, 0.5);
        if (model.internalModel) {
          (model.internalModel as unknown as { eyeBlink?: unknown }).eyeBlink = undefined;
        }
        const mm = model.internalModel?.motionManager as unknown as
          { update: (coreModel: CoreModel, now: number) => boolean } | undefined;
        if (mm) {
          const origUpdate = mm.update.bind(mm);
          mm.update = (coreModel: CoreModel, now: number) => {
            const changed = origUpdate(coreModel, now);
            try {
              driveFrame(coreModel, now);
            } catch {
              // a driver step touching a param this model doesn't have shouldn't kill the model
            }
            return changed;
          };
        }
        modelRef.current = model;
        app.stage.addChild(model);
        setError(null);
        applyLayout();
        applyBackground(settingsRef.current);
      } catch (e) {
        if (token !== loadTokenRef.current || disposed) return;
        setError(`模型加载失败：${dir}（${e instanceof Error ? e.message : String(e)}）`);
      }
    }

    function driveFrame(coreModel: CoreModel, nowMs: number): void {
      const t = nowMs / 1000;
      const settings = settingsRef.current;
      const directive = getActiveDirective(performance.now());
      const mood = directive?.expression ? backendMoodToFrontend(directive.expression) : optsRef.current.getMood();
      const intensity = directive?.expression ? directive.intensity : 0.85;

      // ── expression layer (priority) / param fallback ──
      const expressionManager = (modelRef.current?.internalModel?.motionManager as unknown as {
        expressionManager?: { definitions: { Name: string }[] };
      } | undefined)?.expressionManager;
      const availableNames = expressionManager?.definitions.map(d => d.Name) ?? [];
      const matched = matchExpressionName(availableNames, mood);

      if (matched) {
        if (lastExpressionRef.current !== matched) {
          modelRef.current?.expression(matched).catch(() => {});
          lastExpressionRef.current = matched;
        }
        for (const key of ALL_PARAM_KEYS) {
          const cur = paramStateRef.current.get(key) ?? 0;
          const next = lerp(cur, 0, 0.08);
          paramStateRef.current.set(key, next);
          setParam(coreModel, key, next);
        }
      } else {
        lastExpressionRef.current = null;
        const targets = MOOD_PARAMS[mood] ?? {};
        for (const key of ALL_PARAM_KEYS) {
          const target = (targets[key] ?? 0) * intensity;
          const cur = paramStateRef.current.get(key) ?? 0;
          const next = lerp(cur, target, 0.08);
          paramStateRef.current.set(key, next);
          setParam(coreModel, key, next);
        }
      }

      // P2 sweetener: fire a matching motion group once per mood transition, best-effort.
      if (lastMotionMoodRef.current !== mood) {
        lastMotionMoodRef.current = mood;
        const groupToken = MOOD_TO_EXPRESSION[mood]?.toLowerCase();
        const groups = (modelRef.current?.internalModel?.motionManager as unknown as {
          definitions?: Record<string, unknown[]>;
        } | undefined)?.definitions ?? {};
        const matchedGroup = Object.keys(groups).find(g => g.toLowerCase() === groupToken);
        if (matchedGroup && groupToken !== 'neutral' && cubism4) {
          modelRef.current?.motion(matchedGroup, undefined, cubism4.MotionPriority.NORMAL).catch(() => {});
        }
      }

      // ── reaction pulse (pet mouse-hover feedback: shy / nuzzle), one-shot decaying envelope ──
      let reactionEyeBoost = 0;
      let reactionCheek = 0;
      let reactionAngleZ = 0;
      const rp = reactionPulseRef.current;
      if (rp) {
        const durationMs = rp.kind === 'shy' ? 600 : 800;
        const elapsedMs = performance.now() - rp.startedAt;
        if (elapsedMs >= durationMs) {
          reactionPulseRef.current = null;
        } else {
          const envelope = 1 - elapsedMs / durationMs;
          if (rp.kind === 'shy') {
            reactionEyeBoost = 0.3 * envelope;
            reactionAngleZ = 6 * envelope;
          } else {
            reactionCheek = envelope;
            reactionAngleZ = Math.sin(elapsedMs * 0.05) * 4 * envelope;
          }
        }
      }
      if (reactionCheek > 0) {
        const baselineCheek = getParamValue(coreModel, 'ParamCheek') ?? 0;
        setParam(coreModel, 'ParamCheek', Math.max(baselineCheek, reactionCheek));
      }

      // ── blink ──
      const blinkPulse = getBlinkPulse(blinkStateRef.current, nowMs, mood);
      for (const id of ['ParamEyeLOpen', 'ParamEyeROpen']) {
        const baseline = getParamValue(coreModel, id) ?? 1;
        const openTarget = Math.min(1.4, baseline + reactionEyeBoost);
        setParam(coreModel, id, Math.min(openTarget, 1 - blinkPulse));
      }

      // ── mouth / lipsync ──
      const getVolume = optsRef.current.getVolume;
      let mouthTarget: number;
      if (getVolume) {
        mouthTarget = Math.max(0, Math.min(1, getVolume())) * settings.lipsyncStrength;
      } else {
        const talking = directive?.speaking ?? optsRef.current.getTalking();
        mouthTarget = talking ? (0.5 + 0.5 * Math.sin(t * 12)) * settings.lipsyncStrength : 0;
      }
      mouthValueRef.current = lerp(mouthValueRef.current, mouthTarget, 0.5);
      setParam(coreModel, settings.mouthParam, mouthValueRef.current);

      // ── gaze (angle + eyeball) ──
      let gazeAngleXTarget = 0;
      let gazeAngleYTarget = 0;
      let eyeXTarget = 0;
      let eyeYTarget = 0;
      if (directive?.gaze) {
        const g = directive.gaze;
        if (g.mode === 'point') {
          gazeAngleXTarget = g.x * 30;
          gazeAngleYTarget = g.y * 30;
          eyeXTarget = g.x;
          eyeYTarget = g.y;
        } else if (g.mode === 'away') {
          gazeAngleXTarget = 12;
          eyeXTarget = 0.5;
        }
        // 'user' / 'idle' fall through to the neutral (0, 0) target
      }
      gazeAngleXRef.current = lerp(gazeAngleXRef.current, gazeAngleXTarget, 0.05);
      gazeAngleYRef.current = lerp(gazeAngleYRef.current, gazeAngleYTarget, 0.05);
      eyeBallXRef.current = lerp(eyeBallXRef.current, eyeXTarget, 0.05);
      eyeBallYRef.current = lerp(eyeBallYRef.current, eyeYTarget, 0.05);
      setParam(coreModel, 'ParamEyeBallX', eyeBallXRef.current);
      setParam(coreModel, 'ParamEyeBallY', eyeBallYRef.current);

      // ── gesture (head angle pulses) + idle micro-noise fallback ──
      let gestureAngleX = 0;
      let gestureAngleY = 0;
      let gestureAngleZ = 0;
      let leanScaleTarget = 1;
      if (directive?.gesture) {
        const elapsedMs = performance.now() - directive.receivedAt;
        const rampIn = Math.min(1, elapsedMs / 200);
        const osc = Math.sin(elapsedMs * 0.015) * rampIn;
        switch (directive.gesture) {
          case 'nod':
            gestureAngleY = osc * 12;
            break;
          case 'shake':
            gestureAngleX = osc * 12;
            break;
          case 'tilt':
            gestureAngleZ = rampIn * 10;
            break;
          case 'lean_in':
            leanScaleTarget = 1 + rampIn * 0.03;
            break;
        }
      } else {
        gestureAngleZ = microNoise(t, 37) * 3;
      }
      leanScaleRef.current = lerp(leanScaleRef.current, leanScaleTarget, 0.15);
      if (modelRef.current) {
        const s = baseScaleRef.current * leanScaleRef.current;
        modelRef.current.scale.set(s, s);
      }

      setParam(coreModel, 'ParamAngleX', gazeAngleXRef.current + gestureAngleX);
      setParam(coreModel, 'ParamAngleY', gazeAngleYRef.current + gestureAngleY);
      setParam(coreModel, 'ParamAngleZ', gestureAngleZ + reactionAngleZ);
    }

    const resizeObs = new ResizeObserver(() => applyLayout());
    resizeObs.observe(mount);

    const unsubscribe = subscribeLive2DSettings(next => {
      const prev = settingsRef.current;
      settingsRef.current = next;
      if (prev.modelDir !== next.modelDir) {
        loadModel(next.modelDir);
      } else {
        applyLayout();
        applyBackground(next);
      }
    });

    applyBackground(settingsRef.current);
    loadModel(settingsRef.current.modelDir);

    return () => {
      disposed = true;
      loadTokenRef.current++;
      resizeObs.disconnect();
      unsubscribe();
      if (modelRef.current) {
        app.stage.removeChild(modelRef.current);
        modelRef.current.destroy();
        modelRef.current = null;
      }
      bgSpriteRef.current = null;
      appRef.current = null;
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit layout when the caller's forced-transparent flag or zoom changes (pet zoom slider).
  useEffect(() => {
    const app = appRef.current;
    if (!app || !modelRef.current) return;
    const mount = mountRef.current;
    if (!mount) return;
    const settings = settingsRef.current;
    const zoom = opts.zoom ?? 1;
    const { clientHeight: h } = mount;
    if (h === 0) return;
    const model = modelRef.current;
    const baseH = (model.internalModel?.height as number | undefined) || model.height || 1;
    const scale = (h * 0.95 * settings.scaleMul * zoom) / baseH;
    baseScaleRef.current = scale;
    model.scale.set(scale, scale);
    const transparent = opts.transparent || settings.bgKind === 'transparent';
    app.renderer.backgroundAlpha = transparent ? 0 : app.renderer.backgroundAlpha;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.zoom, opts.transparent]);

  return { error, pulse };
}
