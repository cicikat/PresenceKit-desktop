import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
// IMPORTANT: pixi-live2d-display-lipsyncpatch/cubism4 must NOT be statically imported — its module body
// throws "Could not find Cubism 4 runtime" when window.Live2DCubismCore is absent, which
// kills the entire bundle at startup (main.tsx imports this file transitively via RoomWindow).
// It is loaded lazily via loadCubism4() below, strictly AFTER ensureCubismCore().
// eslint-disable-next-line import/no-unresolved -- subpath export, resolved via package.json "exports"
import type { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4';
import { ensureCubismCore } from './cubismCore';
import { listLive2DModels } from './live2dAssets';
import {
  loadLive2DSettings,
  subscribeLive2DSettings,
  type Live2DSettings,
} from './live2dSettings';
import { MOOD_TO_EXPRESSION, MOOD_PARAMS, matchExpressionName } from './live2dExpressions';
import { availableProfile, expressionFor, findNativeMotion, listNativeMotions, protectedParameters, readModelProfile, type ModelProfile } from './modelProfile';
import { NativeMotionPlayer } from './nativeMotionPlayer';
import { registerStageControls } from './stageControls';
import { anchoredLayout } from './layout';
import { backgroundSource } from './backgroundAssets';
import { MOOD_TABLE } from '../state/store';
import type { Mood } from '../state/store';
import { backendMoodToFrontend } from '../state/mood-mapping';
import { gradeColorMatrix, isNeutralGradeShader } from '../room/gradeConfig';
import type { GradeCfg } from '../room/gradeConfig';
import { getActiveDirective, type ActiveDirective } from '../../windows/room/avatarDirective';
import { microNoise } from '../../windows/room/boneResolver';
import {
  attachDriver,
  attachFinalDriver,
  getRuntimeModel,
  disableBuiltinEyeBlink,
  getExpressionNames,
  getMotionGroupNames,
  getModelHeight,
  getHeadAnchor,
  getParamDefault,
} from './motionAdapter';

// pixi-live2d-display-lipsyncpatch's Cubism4 core model type isn't exported from the package's public
// entry point — treated as `any` throughout this file. // TODO: type
type CoreModel = any; // eslint-disable-line @typescript-eslint/no-explicit-any

type Cubism4Module = typeof import('pixi-live2d-display-lipsyncpatch/cubism4');

let cubism4: Cubism4Module | null = null;
let cubism4Promise: Promise<Cubism4Module> | null = null;

/** Inject the Cubism core script first, then (once) evaluate the cubism4 module. */
async function loadCubism4(): Promise<Cubism4Module> {
  await ensureCubismCore();
  if (!cubism4Promise) {
    cubism4Promise = import('pixi-live2d-display-lipsyncpatch/cubism4').then(m => {
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
  /** Optional caller-owned performance source. Default preserves Pet behavior. */
  getDirective?: (now: number) => ActiveDirective | null;
  getTalking: () => boolean;
  getVolume?: () => number | null;
  transparent: boolean;
  zoom?: number;
  /** Call-only placement; Pet keeps its existing shared base placement. */
  layout?: { scaleMul: number; offset: [number, number] };
  /** Screen-level color grade (call window only). Applied as a color-matrix filter on the stage. */
  grade?: GradeCfg;
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
  const headAnchorRef = useRef({ x: 0, y: -0.4 });
  const applyLayoutRef = useRef<(() => void) | null>(null);
  const loadTokenRef = useRef(0);

  const blinkStateRef = useRef<BlinkState>({ phase: 'idle', nextAt: performance.now() + 2000, startedAt: 0 });
  const mouthValueRef = useRef(0);
  const gazeAngleXRef = useRef(0);
  const gazeAngleYRef = useRef(0);
  const eyeBallXRef = useRef(0);
  const eyeBallYRef = useRef(0);
  const leanScaleRef = useRef(1);
  const postureBodyAngleRef = useRef(0);
  const paramStateRef = useRef<Map<string, number>>(new Map());
  const paramDefaultsRef = useRef<Map<string, number>>(new Map());
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
    let detachDriver: (() => void) | null = null;
    let detachNative: (() => void) | null = null;
    let nativePlayer: NativeMotionPlayer | null = null;
    let profile: ModelProfile | null = null;
    let activeNativeFile: string | null = null;
    let manualExpression: string | null = null;
    let manualUntil = 0;
    let lastDirectiveKey: string | null = null;
    let activeExpression: string | null = null;
    let expressionGeneration = 0;
    let protectedIds = new Set<string>();
    let speaking = false;
    let lastVoiceAt = -Infinity;
    function writeParam(core: CoreModel, id: string, value: number): void {
      if (protectedIds.has(id) && !(speaking && id === settingsRef.current.mouthParam)) return;
      setParam(core, id, value);
    }

    const app = new PIXI.Application({
      resizeTo: mount,
      backgroundAlpha: 0,
      antialias: true,
      // Keep CSS layout in logical pixels while rendering at the screen's pixel density.
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      autoStart: true,
    });
    appRef.current = app;
    mount.appendChild(app.view as HTMLCanvasElement);

    let densityQuery: MediaQueryList | null = null;
    function syncPixelDensity(): void {
      if (disposed) return;
      const density = window.devicePixelRatio || 1;
      for (const filter of app.stage.filters ?? []) filter.resolution = density;
      if (app.renderer.resolution !== density) {
        app.renderer.resolution = density;
        app.renderer.resize(mount!.clientWidth, mount!.clientHeight);
      }
      // Re-arm for the new density when moving between monitors or changing display scale.
      densityQuery?.removeEventListener('change', syncPixelDensity);
      densityQuery = window.matchMedia(`(resolution: ${density}dppx)`);
      densityQuery.addEventListener('change', syncPixelDensity);
    }
    syncPixelDensity();
    window.addEventListener('resize', syncPixelDensity);

    function isForceTransparent(): boolean {
      return optsRef.current.transparent;
    }

    let backgroundToken = 0;
    let backgroundKey: string | null = null;
    function fitBackground(): void {
      const sprite = bgSpriteRef.current;
      if (!sprite) return;
      const scale = Math.max(mount!.clientWidth / sprite.texture.width, mount!.clientHeight / sprite.texture.height) || 1;
      sprite.scale.set(scale);
      sprite.position.set(mount!.clientWidth / 2, mount!.clientHeight / 2);
    }
    function applyBackground(settings: Live2DSettings): void {
      const key = JSON.stringify([isForceTransparent(), settings.bgKind, settings.bgColor, settings.bgImage]);
      if (key === backgroundKey) return;
      backgroundKey = key;
      const token = ++backgroundToken;
      const a = appRef.current;
      if (!a) return;
      const transparent = isForceTransparent() || settings.bgKind === 'transparent';

      if (bgSpriteRef.current) {
        a.stage.removeChild(bgSpriteRef.current);
        bgSpriteRef.current.destroy({ children: true, texture: true, baseTexture: true });
        bgSpriteRef.current = null;
      }

      if (transparent) {
        a.renderer.background.alpha = 0;
        return;
      }

      if (settings.bgKind === 'color') {
        a.renderer.background.alpha = 1;
        const parsed = parseInt(settings.bgColor.replace('#', ''), 16);
        if (Number.isFinite(parsed)) a.renderer.background.color = parsed;
        return;
      }

      if (settings.bgKind === 'image' && settings.bgImage) {
        a.renderer.background.alpha = 1;
        backgroundSource(settings.bgImage).then(async source => {
          // Each stage owns its texture; a cancelled load must not destroy another stage's cached texture.
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.src = source;
          await image.decode();
          return new PIXI.Texture(new PIXI.BaseTexture(image));
        })
          .then((texture: PIXI.Texture) => {
            if (disposed || token !== backgroundToken) { texture.destroy(true); return; }
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
            fitBackground();
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
      const placement = optsRef.current.layout ?? settings;
      const layout = anchoredLayout(w, h, getModelHeight(model), placement.scaleMul, zoom, placement.offset, headAnchorRef.current);
      baseScaleRef.current = layout.scale;
      model.scale.set(layout.scale);
      model.position.set(layout.x, layout.y);
    }
    applyLayoutRef.current = applyLayout;

    async function loadModel(dir: string): Promise<void> {
      const token = ++loadTokenRef.current;
      detachNative?.();
      detachNative = null;
      nativePlayer = null;
      profile = null;
      activeNativeFile = null;
      manualExpression = null;
      manualUntil = 0;
      lastVoiceAt = -Infinity;
      activeExpression = null;
      expressionGeneration++;
      lastDirectiveKey = null;
      if (modelRef.current) {
        detachDriver?.();
        detachDriver = null;
        app.stage.removeChild(modelRef.current);
        modelRef.current.destroy();
        modelRef.current = null;
      }
      lastExpressionRef.current = null;
      lastMotionMoodRef.current = null;
      paramStateRef.current.clear();
      paramDefaultsRef.current.clear();

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
      let mocVersion: number | null = null;
      try {
        const assets = await listLive2DModels();
        const asset = assets.find(a => a.dirName === dir);
        modelJson = asset?.modelJson ?? null;
        mocVersion = asset?.mocVersion ?? null;
      } catch {
        modelJson = null;
      }
      if (token !== loadTokenRef.current || disposed) return;
      if (!modelJson) {
        setError(`模型目录 public/live2d/models/${dir}/ 内未找到 *.model3.json`);
        return;
      }
      // moc3 v≥6 (Cubism Editor 5.2+) may use offscreen-rendering parts that this renderer
      // (pixi-live2d-display-lipsyncpatch@0.5.0, Core 4/5-era) never draws — cc-tasks/31.
      if (mocVersion !== null && mocVersion >= 6) {
        console.warn(`[live2d] 模型「${dir}」moc3 v${mocVersion} 使用了 offscreen 特性，当前渲染栈可能缺件（鼻/嘴等下半脸部件）`);
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
        headAnchorRef.current = getHeadAnchor(model);
        // §0 diagnostic (cc-tasks/31): confirm whether Core actually parsed offscreen groups for
        // this moc3 — `_model` is CubismModel's private native-handle field, only present on Core 6+.
        try {
          const nativeModel = (model.internalModel?.coreModel as unknown as {
            _model?: { offscreens?: { count?: number } };
          })?._model;
          const offscreenCount = nativeModel?.offscreens?.count ?? 0;
          console.info(`[live2d] 模型「${dir}」offscreens.count=${offscreenCount}`);
        } catch { /* diagnostic only, never block model load */ }
        const runtime = getRuntimeModel(model);
        profile = readModelProfile(runtime?.settings?.json?.EmeraldProfile);
        const motions = listNativeMotions(runtime?.motionManager.definitions);
        const available = getExpressionNames(model);
        profile = availableProfile(profile, motions, available);
        if (runtime) {
          const player = new NativeMotionPlayer({
            stop: () => runtime.motionManager.stopAllMotions(),
            play: async (file, isCurrent, loop) => {
              const motion = findNativeMotion(motions, file);
              if (!motion) return false;
              const loaded = await runtime.motionManager.loadMotion(motion.group, motion.index) as { setIsLoop?: (value: boolean) => void } | undefined;
              if (!isCurrent() || disposed || token !== loadTokenRef.current || !cubism4) return false;
              if (!loaded) return false;
              loaded.setIsLoop?.(loop);
              return model.motion(motion.group, motion.index, cubism4.MotionPriority.FORCE, { resetExpression: false });
            },
          });
          nativePlayer = player;
          const onStart = (group: string, index: number) => {
            activeNativeFile = motions.find(m => m.group === group && m.index === index)?.file ?? null;
            // StartMotion restores expressions in some library versions. Reapply once after start.
            if (profile) lastExpressionRef.current = null;
          };
          const onFinish = () => { activeNativeFile = null; player.finish(); };
          runtime.motionManager.on('motionStart', onStart);
          runtime.motionManager.on('motionFinish', onFinish);
          const previewAction = (name: string) => {
            const action = profile?.actions[name];
            if (!action) return;
            manualUntil = performance.now() + 8000;
            lastDirectiveKey = 'preview';
            player.request(action, `preview:${name}:${performance.now()}`, manualUntil);
          };
          const unregister = registerStageControls({
            model: dir, expressions: available, motions: [...new Set(motions.map(m => m.file))],
            actions: Object.keys(profile?.actions ?? {}),
            playExpression: name => {
              if (name !== null && !available.includes(name)) return;
              manualExpression = name;
              lastExpressionRef.current = null;
            },
            playMotion: file => {
              if (!findNativeMotion(motions, file)) return;
              manualUntil = performance.now() + 8000;
              lastDirectiveKey = 'preview';
              player.request({ enter: file }, `preview:${file}:${manualUntil}`, manualUntil);
            },
            playAction: previewAction,
            stop: () => {
              if (disposed || token !== loadTokenRef.current) return;
              manualUntil = 0;
              manualExpression = null;
              expressionGeneration++;
              activeExpression = null;
              lastExpressionRef.current = null;
              lastDirectiveKey = null;
              player.stop();
              activeNativeFile = null;
              runtime.motionManager.expressionManager?.resetExpression();
            },
          });
          const pointerTap = (event: PIXI.FederatedPointerEvent) => {
            // A drag must not also trigger an authored touch reaction.
            if (Math.hypot(event.global.x - pointerDown.x, event.global.y - pointerDown.y) > 6) return;
            const hit = model.hitTest(event.global.x, event.global.y);
            const action = hit.map(name => profile?.hitAreas[name]).find(Boolean);
            if (action) previewAction(action);
          };
          const pointerDown = { x: 0, y: 0 };
          const onDown = (event: PIXI.FederatedPointerEvent) => { pointerDown.x = event.global.x; pointerDown.y = event.global.y; };
          model.eventMode = 'static';
          model.on('pointerdown', onDown);
          model.on('pointertap', pointerTap);
          detachNative = () => {
            unregister();
            runtime.motionManager.off('motionStart', onStart);
            runtime.motionManager.off('motionFinish', onFinish);
            model.off('pointerdown', onDown);
            model.off('pointertap', pointerTap);
            player.dispose();
          };
        }
        disableBuiltinEyeBlink(model);
        detachDriver = profile ? attachFinalDriver(model, driveFrame) : attachDriver(model, driveFrame);
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
      const directive = (optsRef.current.getDirective ?? getActiveDirective)(performance.now());
      const mood = directive?.expression ? backendMoodToFrontend(directive.expression) : optsRef.current.getMood();
      const intensity = directive?.expression ? directive.intensity : 0.85;
      const now = performance.now();
      speaking = directive?.speaking ?? optsRef.current.getTalking();
      const measuredVolume = optsRef.current.getVolume?.() ?? null;
      if (measuredVolume !== null && measuredVolume > 0) lastVoiceAt = now;
      if (now - lastVoiceAt < 180) speaking = true;
      nativePlayer?.tick(now);
      if (now >= manualUntil) {
        const gesture = directive?.gesture;
        const actionName = gesture && profile?.actions[gesture] ? gesture
          : directive?.posture && profile?.actions[directive.posture] ? directive.posture
          : speaking && profile?.actions.speaking ? 'speaking' : null;
        const key = actionName === 'speaking' ? 'speaking'
          : actionName && directive ? `${directive.origin}:${directive.receivedAt}:${actionName}` : null;
        if (key !== lastDirectiveKey) {
          lastDirectiveKey = key;
          nativePlayer?.request(actionName ? profile!.actions[actionName] : null, key,
            actionName !== 'speaking' && directive ? directive.receivedAt + directive.ttl_ms : Infinity);
        }
      }
      protectedIds = protectedParameters(profile, activeNativeFile ?? nativePlayer?.currentFile ?? null, activeExpression);

      // ── expression layer (priority) / param fallback ──
      const availableNames = getExpressionNames(modelRef.current);
      const matched = manualExpression
        ?? expressionFor(profile, directive?.expression ?? MOOD_TO_EXPRESSION[mood], availableNames)
        ?? matchExpressionName(availableNames, mood);

      // Reset target for a param is its model default (NOT 0 — eyes default open at 1);
      // mood poses blend from the default toward the table value by `intensity`.
      const paramDefault = (key: string): number => {
        let d = paramDefaultsRef.current.get(key);
        if (d === undefined) {
          d = getParamDefault(coreModel, key);
          paramDefaultsRef.current.set(key, d);
        }
        return d;
      };

      if (matched) {
        if (lastExpressionRef.current !== matched) {
          const generation = ++expressionGeneration;
          const expressionModel = modelRef.current;
          lastExpressionRef.current = matched;
          expressionModel?.expression(matched).then(started => {
            if (generation === expressionGeneration && expressionModel === modelRef.current) {
              activeExpression = started ? matched : null;
            }
          }).catch(() => {
            if (generation === expressionGeneration) {
              activeExpression = null;
              lastExpressionRef.current = null;
            }
          });
        }
        for (const key of profile?.preserveNativeParameters ? [] : ALL_PARAM_KEYS) {
          const def = paramDefault(key);
          const cur = paramStateRef.current.get(key) ?? def;
          const next = lerp(cur, def, 0.08);
          paramStateRef.current.set(key, next);
          writeParam(coreModel, key, next);
        }
      } else {
        if (lastExpressionRef.current && profile) {
          expressionGeneration++;
          getRuntimeModel(modelRef.current)?.motionManager.expressionManager?.resetExpression();
          activeExpression = null;
        }
        lastExpressionRef.current = null;
        const targets = MOOD_PARAMS[mood] ?? {};
        for (const key of ALL_PARAM_KEYS) {
          const def = paramDefault(key);
          const moodTarget = targets[key];
          const target = moodTarget === undefined ? def : def + (moodTarget - def) * intensity;
          const cur = paramStateRef.current.get(key) ?? def;
          const next = lerp(cur, target, 0.08);
          paramStateRef.current.set(key, next);
          writeParam(coreModel, key, next);
        }
      }

      // P2 sweetener: fire a matching motion group once per mood transition, best-effort.
      if (!profile && lastMotionMoodRef.current !== mood) {
        lastMotionMoodRef.current = mood;
        const groupToken = MOOD_TO_EXPRESSION[mood]?.toLowerCase();
        const matchedGroup = getMotionGroupNames(modelRef.current).find(g => g.toLowerCase() === groupToken);
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
        writeParam(coreModel, 'ParamCheek', Math.max(baselineCheek, reactionCheek));
      }

      // ── blink ──
      const blinkPulse = getBlinkPulse(blinkStateRef.current, nowMs, mood);
      for (const id of ['ParamEyeLOpen', 'ParamEyeROpen']) {
        const baseline = getParamValue(coreModel, id) ?? 1;
        const openTarget = Math.min(1.4, baseline + reactionEyeBoost);
        writeParam(coreModel, id, Math.min(openTarget, 1 - blinkPulse));
      }

      // ── mouth / lipsync ──
      let mouthTarget: number;
      if (measuredVolume !== null && Number.isFinite(measuredVolume)) {
        mouthTarget = Math.max(0, Math.min(1, measuredVolume)) * settings.lipsyncStrength;
      } else {
        mouthTarget = speaking ? (0.5 + 0.5 * Math.sin(t * 12)) * settings.lipsyncStrength : 0;
      }
      mouthValueRef.current = lerp(mouthValueRef.current, mouthTarget, 0.5);
      if (!profile?.preserveNativeParameters || speaking) {
        writeParam(coreModel, settings.mouthParam, mouthValueRef.current);
      }

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
      writeParam(coreModel, 'ParamEyeBallX', eyeBallXRef.current);
      writeParam(coreModel, 'ParamEyeBallY', eyeBallYRef.current);

      // ── gesture (head angle pulses) + idle micro-noise fallback ──
      // energy: perform-layer amplitude scalar (Brief 12 §6.3); 0.5 (no directive) = baseline.
      const energy = directive?.energy ?? 0.5;
      const energyMul = 0.5 + energy;
      let gestureAngleX = 0;
      let gestureAngleY = 0;
      let gestureAngleZ = 0;
      let leanScaleTarget = 1;
      if (directive?.gesture && !(profile?.actions[directive.gesture] && nativePlayer && !nativePlayer.failed)) {
        const elapsedMs = performance.now() - directive.receivedAt;
        const rampIn = Math.min(1, elapsedMs / 200);
        const osc = Math.sin(elapsedMs * 0.015) * rampIn * energyMul;
        switch (directive.gesture) {
          case 'nod':
            gestureAngleY = osc * 12;
            break;
          case 'shake':
            gestureAngleX = osc * 12;
            break;
          case 'tilt':
          case 'tilt_r':
            gestureAngleZ = rampIn * 10;
            break;
          case 'tilt_l':
            gestureAngleZ = -rampIn * 10;
            break;
          case 'dip':
            gestureAngleY = -rampIn * 10;
            break;
          case 'lean_in':
            leanScaleTarget = 1 + rampIn * 0.03;
            break;
        }
      } else if (!profile?.preserveNativeParameters) {
        gestureAngleZ = microNoise(t, 37) * 3;
      }
      leanScaleRef.current = lerp(leanScaleRef.current, leanScaleTarget, 0.15);
      if (modelRef.current) {
        const s = baseScaleRef.current * leanScaleRef.current;
        modelRef.current.scale.set(s, s);
      }

      // ── posture (Brief 12 §7, P2/best-effort): lean_in/lean_back → ParamBodyAngleX (no-op if
      // the model lacks that param); shrink/straighten have no Live2D-side mapping yet — silently
      // ignored. // TODO: shrink/straighten body-angle mapping once a suitable param is settled on.
      let postureBodyAngleXTarget = 0;
      if ((directive?.posture === 'lean_in' || directive?.posture === 'lean_back') && !(profile?.actions[directive.posture] && nativePlayer && !nativePlayer.failed)) {
        const postureRamp = Math.min(1, (performance.now() - directive.receivedAt) / 300);
        postureBodyAngleXTarget = (directive.posture === 'lean_in' ? 8 : -8) * postureRamp * energyMul;
      }
      postureBodyAngleRef.current = lerp(postureBodyAngleRef.current, postureBodyAngleXTarget, 0.1);
      writeParam(coreModel, 'ParamBodyAngleX', postureBodyAngleRef.current);

      writeParam(coreModel, 'ParamAngleX', gazeAngleXRef.current + gestureAngleX);
      writeParam(coreModel, 'ParamAngleY', gazeAngleYRef.current + gestureAngleY);
      writeParam(coreModel, 'ParamAngleZ', gestureAngleZ + reactionAngleZ);
    }

    const resizeObs = new ResizeObserver(() => { applyLayout(); fitBackground(); });
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
      backgroundToken++;
      applyLayoutRef.current = null;
      densityQuery?.removeEventListener('change', syncPixelDensity);
      window.removeEventListener('resize', syncPixelDensity);
      loadTokenRef.current++;
      detachNative?.();
      detachNative = null;
      resizeObs.disconnect();
      unsubscribe();
      if (modelRef.current) {
        detachDriver?.();
        detachDriver = null;
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

  // Color grade as a ColorMatrixFilter on the whole stage. Only temperature/tint/saturation/
  // contrast/lift are expressible here; exposure, tone mapping, vignette and bloom are 3D-only.
  const gradeFilterRef = useRef<PIXI.ColorMatrixFilter | null>(null);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const grade = opts.grade;
    if (!grade || !grade.enabled || isNeutralGradeShader(grade)) {
      app.stage.filters = null;
      gradeFilterRef.current?.destroy();
      gradeFilterRef.current = null;
      return;
    }
    const filter = gradeFilterRef.current ?? new PIXI.ColorMatrixFilter();
    filter.resolution = app.renderer.resolution;
    filter.matrix = gradeColorMatrix(grade) as unknown as PIXI.ColorMatrix;
    gradeFilterRef.current = filter;
    app.stage.filters = [filter];
  }, [opts.grade]);

  // Re-fit layout when the caller's forced-transparent flag or zoom changes (pet zoom slider).
  useEffect(() => {
    const app = appRef.current;
    if (!app || !modelRef.current) return;
    const mount = mountRef.current;
    if (!mount) return;
    const settings = settingsRef.current;
    applyLayoutRef.current?.();
    const transparent = opts.transparent || settings.bgKind === 'transparent';
    app.renderer.background.alpha = transparent ? 0 : app.renderer.background.alpha;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.zoom, opts.transparent, opts.layout]);

  return { error, pulse };
}
