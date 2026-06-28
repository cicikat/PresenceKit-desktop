import { useEffect, useRef } from 'react';
import {
  DEFAULT_PET_SNAPSHOT,
  type PetMouseReaction,
  type PetSnapshot,
} from '../../../shared/pet/types';
import {
  loadPetVisualStyle,
  subscribePetVisualStyle,
  type PetVisualStyle,
} from '../../../shared/pet/petVisualStyle';
import {
  loadPetRippleSettings,
  subscribePetRippleSettings,
  type PetRippleSettings,
} from '../../../shared/pet/petRippleSettings';

type Rgb = [number, number, number];

interface Ripple {
  x: number;
  y: number;
  radius: number;
  life: number;
}

interface Palette {
  primary: Rgb;
  secondary: Rgb;
  glow: Rgb;
}

interface Blob {
  orbitRadius: number;
  angle: number;
  speed: number;
  size: number;
  phase: number;
  breathSpeed: number;
  x: number;
  y: number;
}

interface Accent {
  orbitRadius: number;
  angle: number;
  speed: number;
  size: number;
  phase: number;
}

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
}

interface VisualState {
  palette: Palette;
  alpha: number;
  speed: number;
  orbit: number;
  wobble: number;
  breathRate: number;
  breathDepth: number;
  coreScale: number;
  pulse: number;
}

const PALETTES: Record<string, Palette> = {
  '平静': { primary: [184, 158, 226], secondary: [211, 194, 241], glow: [255, 251, 255] },
  '开心': { primary: [226, 153, 193], secondary: [243, 194, 218], glow: [255, 240, 248] },
  '低落': { primary: [116, 132, 188], secondary: [158, 174, 215], glow: [213, 222, 247] },
  '病娇': { primary: [148, 108, 186], secondary: [189, 150, 213], glow: [236, 211, 246] },
  '分心': { primary: [164, 153, 204], secondary: [197, 187, 225], glow: [235, 229, 248] },
  '生气': { primary: [196, 129, 128], secondary: [225, 172, 162], glow: [255, 227, 211] },
  '惊讶': { primary: [220, 184, 112], secondary: [240, 215, 161], glow: [255, 245, 214] },
  thinking: { primary: [221, 190, 158], secondary: [239, 216, 188], glow: [255, 247, 225] },
  sleepy: { primary: [101, 118, 174], secondary: [143, 157, 202], glow: [204, 213, 241] },
};

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
const lerp = (current: number, target: number, amount: number) => current + (target - current) * amount;
const lerpRgb = (current: Rgb, target: Rgb, amount: number): Rgb => [
  lerp(current[0], target[0], amount),
  lerp(current[1], target[1], amount),
  lerp(current[2], target[2], amount),
];

const MOOD_MOTION: Record<string, Pick<VisualState, 'speed' | 'orbit' | 'wobble' | 'breathRate' | 'breathDepth'>> = {
  '平静': { speed: 1, orbit: 1, wobble: 1, breathRate: 1, breathDepth: 1 },
  '开心': { speed: 1.28, orbit: 1.08, wobble: 1.22, breathRate: 1.28, breathDepth: 1.18 },
  '低落': { speed: 0.58, orbit: 0.88, wobble: 0.58, breathRate: 0.72, breathDepth: 0.86 },
  '病娇': { speed: 0.82, orbit: 0.76, wobble: 0.72, breathRate: 1.12, breathDepth: 1.12 },
  '分心': { speed: 0.9, orbit: 1.16, wobble: 1.32, breathRate: 0.92, breathDepth: 0.88 },
  '生气': { speed: 1.52, orbit: 1.04, wobble: 1.5, breathRate: 1.55, breathDepth: 1.28 },
  '惊讶': { speed: 1.36, orbit: 1.2, wobble: 1.12, breathRate: 1.34, breathDepth: 1.34 },
};

function visualTarget(state: PetSnapshot): VisualState {
  const motion = MOOD_MOTION[state.mood] ?? MOOD_MOTION['平静'];
  const presence = state.presence === 'away'
    ? { alpha: 0.46, speed: 0.34, orbit: 0.62, wobble: 0.5, breathRate: 0.68, coreScale: 0.82 }
    : state.presence === 'idle'
      ? { alpha: 0.76, speed: 0.62, orbit: 0.86, wobble: 0.72, breathRate: 0.82, coreScale: 0.92 }
      : { alpha: 1, speed: 1, orbit: 1, wobble: 1, breathRate: 1, coreScale: 1 };
  const thinking = state.thinking
    ? { speed: 0.72, orbit: 0.72, wobble: 0.68, breathRate: 1.08, coreScale: 0.94, pulse: 1 }
    : { speed: 1, orbit: 1, wobble: 1, breathRate: 1, coreScale: 1, pulse: 0 };

  return {
    palette: state.thinking
      ? PALETTES.thinking
      : state.presence === 'away'
        ? PALETTES.sleepy
        : PALETTES[state.mood] ?? PALETTES['平静'],
    alpha: presence.alpha,
    speed: motion.speed * presence.speed * thinking.speed,
    orbit: motion.orbit * presence.orbit * thinking.orbit,
    wobble: motion.wobble * presence.wobble * thinking.wobble,
    breathRate: motion.breathRate * presence.breathRate * thinking.breathRate,
    breathDepth: motion.breathDepth,
    coreScale: presence.coreScale * thinking.coreScale,
    pulse: thinking.pulse,
  };
}

function approachVisual(current: VisualState, target: VisualState, delta: number) {
  const amount = 1 - Math.exp(-delta * 1.8);
  current.palette = {
    primary: lerpRgb(current.palette.primary, target.palette.primary, amount),
    secondary: lerpRgb(current.palette.secondary, target.palette.secondary, amount),
    glow: lerpRgb(current.palette.glow, target.palette.glow, amount),
  };
  current.alpha = lerp(current.alpha, target.alpha, amount);
  current.speed = lerp(current.speed, target.speed, amount);
  current.orbit = lerp(current.orbit, target.orbit, amount);
  current.wobble = lerp(current.wobble, target.wobble, amount);
  current.breathRate = lerp(current.breathRate, target.breathRate, amount);
  current.breathDepth = lerp(current.breathDepth, target.breathDepth, amount);
  current.coreScale = lerp(current.coreScale, target.coreScale, amount);
  current.pulse = lerp(current.pulse, target.pulse, amount);
}

function makeBlobs(width: number, height: number): Blob[] {
  const centerX = width / 2;
  const centerY = height / 2;
  return Array.from({ length: 6 }, (_, index) => ({
    orbitRadius: 28 + Math.random() * 34,
    angle: (Math.PI * 2 * index) / 6 + (Math.random() - 0.5) * 0.32,
    speed: (0.16 + Math.random() * 0.18) * (index % 2 === 0 ? 1 : -1),
    size: 24 + Math.random() * 11,
    phase: Math.random() * Math.PI * 2,
    breathSpeed: 0.76 + Math.random() * 0.68,
    x: centerX,
    y: centerY,
  }));
}

function makeAccents(): Accent[] {
  return Array.from({ length: 7 }, (_, index) => ({
    orbitRadius: 58 + Math.random() * 32,
    angle: (Math.PI * 2 * index) / 7 + Math.random() * 0.4,
    speed: (0.11 + Math.random() * 0.16) * (index % 2 === 0 ? 1 : -1),
    size: 1.1 + Math.random() * 1.2,
    phase: Math.random() * Math.PI * 2,
  }));
}

function makeScatterDots(width: number, height: number): Dot[] {
  return Array.from({ length: 60 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    homeX: width / 2,
    homeY: height / 2,
  }));
}

function makeNetworkDots(width: number, height: number): Dot[] {
  const cx = width / 2;
  const cy = height / 2;
  const rings: { radius: number; count: number }[] = [
    { radius: 30, count: 5 },
    { radius: 60, count: 10 },
    { radius: 90, count: 14 },
    { radius: 118, count: 10 },
  ];
  const dots: Dot[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = (Math.PI * 2 * i) / ring.count;
      const hx = cx + Math.cos(a) * ring.radius;
      const hy = cy + Math.sin(a) * ring.radius;
      dots.push({
        x: hx + (Math.random() - 0.5) * 4,
        y: hy + (Math.random() - 0.5) * 4,
        vx: 0, vy: 0, homeX: hx, homeY: hy,
      });
    }
  }
  for (let i = 0; i < 10; i++) {
    const hx = cx + (Math.random() - 0.5) * 160;
    const hy = cy + (Math.random() - 0.5) * 160;
    dots.push({
      x: hx, y: hy,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      homeX: hx, homeY: hy,
    });
  }
  return dots;
}

function tickDots(
  dots: Dot[],
  mouse: { x: number; y: number },
  width: number,
  height: number,
  delta: number,
  speedScale: number,
  homeSpring: number,
  damping: number,
  centerPull: number,
  bounceEdges: boolean,
) {
  const cx = width / 2;
  const cy = height / 2;
  const t = delta * 60;
  for (const dot of dots) {
    dot.vx += (cx - dot.x) * centerPull * t;
    dot.vy += (cy - dot.y) * centerPull * t;
    if (homeSpring > 0) {
      dot.vx += (dot.homeX - dot.x) * homeSpring * t;
      dot.vy += (dot.homeY - dot.y) * homeSpring * t;
    }
    const rdx = dot.x - mouse.x;
    const rdy = dot.y - mouse.y;
    const rd = Math.hypot(rdx, rdy);
    if (rd > 0 && rd < 50) {
      const f = (1 - rd / 50) * 1.5 * t;
      dot.vx += (rdx / rd) * f;
      dot.vy += (rdy / rd) * f;
    }
    dot.vx *= Math.pow(damping, t);
    dot.vy *= Math.pow(damping, t);
    dot.x += dot.vx * speedScale * t;
    dot.y += dot.vy * speedScale * t;
    if (bounceEdges) {
      if (dot.x < 0) { dot.x = 0; dot.vx = Math.abs(dot.vx); }
      else if (dot.x > width) { dot.x = width; dot.vx = -Math.abs(dot.vx); }
      if (dot.y < 0) { dot.y = 0; dot.vy = Math.abs(dot.vy); }
      else if (dot.y > height) { dot.y = height; dot.vy = -Math.abs(dot.vy); }
    }
  }
}

function renderScatter(ctx: CanvasRenderingContext2D, dots: Dot[], palette: Palette, alphaScale: number) {
  for (let i = 0; i < dots.length; i++) {
    for (let j = i + 1; j < dots.length; j++) {
      const d = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
      if (d < 35) {
        ctx.strokeStyle = rgba(palette.primary, (1 - d / 35) * 0.196 * alphaScale);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(dots[i].x, dots[i].y);
        ctx.lineTo(dots[j].x, dots[j].y);
        ctx.stroke();
      }
    }
  }
  for (const dot of dots) {
    ctx.fillStyle = rgba(palette.primary, 0.55 * alphaScale);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderNetwork(ctx: CanvasRenderingContext2D, dots: Dot[], palette: Palette, alphaScale: number) {
  for (let i = 0; i < dots.length; i++) {
    for (let j = i + 1; j < dots.length; j++) {
      const d = Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y);
      if (d < 80) {
        ctx.strokeStyle = rgba(palette.primary, (1 - d / 80) * 0.47 * alphaScale);
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(dots[i].x, dots[i].y);
        ctx.lineTo(dots[j].x, dots[j].y);
        ctx.stroke();
      }
    }
  }
  for (const dot of dots) {
    ctx.fillStyle = rgba(palette.primary, 0.12 * alphaScale);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(palette.primary, 0.7 * alphaScale);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlob(
  context: CanvasRenderingContext2D,
  blob: Blob,
  palette: Palette,
  radius: number,
  alphaScale: number,
) {
  for (const [scale, alpha] of [
    [3, 0.045],
    [2.1, 0.09],
    [1.45, 0.18],
    [1, 0.42],
    [0.62, 0.66],
  ] as const) {
    context.fillStyle = rgba(palette.primary, alpha * alphaScale);
    context.beginPath();
    context.arc(blob.x, blob.y, radius * scale, 0, Math.PI * 2);
    context.fill();
  }

  const highlightRadius = Math.max(2, radius * 0.22);
  context.fillStyle = rgba(palette.glow, 0.4 * alphaScale);
  context.beginPath();
  context.arc(
    blob.x + radius * 0.24,
    blob.y - radius * 0.24,
    highlightRadius,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function drawCore(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  palette: Palette,
  breathWave: number,
  thinkingWave: number,
  alphaScale: number,
  coreScale: number,
) {
  const pulse = breathWave * 7 + thinkingWave * 2.5;
  for (const [radius, alpha] of [
    [86 + pulse * 2.1, 0.055],
    [58 + pulse * 1.5, 0.12],
    [39 + pulse, 0.25],
    [25 + pulse * 0.62, 0.56],
    [12 + pulse * 0.28, 0.88],
  ] as const) {
    context.fillStyle = rgba(palette.glow, alpha * alphaScale);
    context.beginPath();
    context.arc(centerX, centerY, radius * coreScale, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = rgba([255, 255, 255], (0.9 + breathWave * 0.07) * alphaScale);
  context.beginPath();
  context.arc(centerX, centerY, (5.5 + breathWave * 1.4) * coreScale, 0, Math.PI * 2);
  context.fill();
}

function drawAccent(
  context: CanvasRenderingContext2D,
  accent: Accent,
  centerX: number,
  centerY: number,
  palette: Palette,
  time: number,
  alphaScale: number,
  delta: number,
  visual: VisualState,
) {
  accent.angle += accent.speed * delta * visual.speed;
  const wobble = Math.sin(time * 0.8 + accent.phase) * 5 * visual.wobble;
  const radius = accent.orbitRadius * visual.orbit + wobble;
  const x = centerX + Math.cos(accent.angle) * radius;
  const y = centerY + Math.sin(accent.angle) * radius * 0.86;
  const alpha = (0.18 + (Math.sin(time * 1.3 + accent.phase) + 1) * 0.08) * alphaScale;

  context.fillStyle = rgba(palette.secondary, alpha);
  context.beginPath();
  context.arc(x, y, accent.size * 2.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = rgba(palette.glow, Math.min(0.62, alpha * 1.8));
  context.beginPath();
  context.arc(x, y, accent.size, 0, Math.PI * 2);
  context.fill();
}

function drawInteractionPulse(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  reaction: PetMouseReaction | null,
  reactionStartedAt: number,
  timestamp: number,
) {
  if (!reaction || !reactionStartedAt) return;
  const progress = Math.min(1, (timestamp - reactionStartedAt) / 800);
  if (progress >= 1) return;
  const nuzzle = reaction.kind === 'nuzzle';
  const radius = nuzzle ? 28 + progress * 70 : 92 - progress * 42;
  const alpha = Math.sin(progress * Math.PI) * (nuzzle ? 0.42 : 0.32);
  context.strokeStyle = nuzzle ? `rgba(255, 219, 238, ${alpha})` : `rgba(220, 205, 255, ${alpha})`;
  context.lineWidth = nuzzle ? 2.4 : 1.8;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
}

export function ParticleCanvas({ snapshot, reaction, volume = 0 }: { snapshot: PetSnapshot; reaction?: PetMouseReaction | null; volume?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);
  const reactionRef = useRef<PetMouseReaction | null>(reaction ?? null);
  const reactionStartedAtRef = useRef(0);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const styleRef = useRef<PetVisualStyle>(loadPetVisualStyle());
  const rippleRef = useRef<Ripple[]>([]);
  const rippleSettingsRef = useRef<PetRippleSettings>(loadPetRippleSettings());
  const volumeRef = useRef(volume);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    reactionRef.current = reaction ?? null;
    reactionStartedAtRef.current = reaction ? performance.now() : 0;
  }, [reaction]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => subscribePetVisualStyle(style => { styleRef.current = style; }), []);
  useEffect(() => subscribePetRippleSettings(s => { rippleSettingsRef.current = s; }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let blobs: Blob[] = [];
    let accents: Accent[] = [];
    let scatterDots: Dot[] = [];
    let networkDots: Dot[] = [];
    let lastTimestamp = 0;
    const visual = visualTarget(DEFAULT_PET_SNAPSHOT);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      blobs = makeBlobs(width, height);
      accents = makeAccents();
      scatterDots = makeScatterDots(width, height);
      networkDots = makeNetworkDots(width, height);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (timestamp: number) => {
      const state = snapshotRef.current;
      const delta = lastTimestamp ? Math.min(0.05, (timestamp - lastTimestamp) / 1000) : 1 / 60;
      lastTimestamp = timestamp;
      approachVisual(visual, visualTarget(state), delta);
      const palette = visual.palette;
      const alphaScale = visual.alpha;
      const centerX = width / 2;
      const centerY = height / 2;
      const time = timestamp / 1000;
      const breathWave = (Math.sin(time * 1.75 * visual.breathRate) + 1) / 2;
      const thinkingWave = ((Math.sin(time * 4.8) + 1) / 2) * visual.pulse;

      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = 'rgba(0, 0, 0, 0.86)';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';

      const style = styleRef.current;
      const volumeBoost = 1 + volumeRef.current * 3;
      if (style === 'fluid') {
        for (const blob of blobs) {
          blob.angle += blob.speed * delta * visual.speed;
          const wobble = Math.sin(time * 0.7 + blob.phase) * 7 * visual.wobble;
          const orbit = blob.orbitRadius * visual.orbit * volumeBoost + wobble;
          let x = centerX + Math.cos(blob.angle) * orbit;
          let y = centerY + Math.sin(blob.angle) * orbit * 0.84;
          const dx = x - mouseRef.current.x;
          const dy = y - mouseRef.current.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 68) {
            const force = (1 - distance / 68) * 17;
            x += (dx / distance) * force;
            y += (dy / distance) * force;
          }
          blob.x = x;
          blob.y = y;
          const localBreath = Math.sin(time * blob.breathSpeed * visual.breathRate + blob.phase)
            * 2.6 * visual.breathDepth;
          const syncedBreath = breathWave * 5.2 * visual.breathDepth + thinkingWave * 1.8;
          drawBlob(context, blob, palette, blob.size + localBreath + syncedBreath, alphaScale);
        }
        for (const accent of accents) {
          drawAccent(context, accent, centerX, centerY, palette, time, alphaScale, delta, visual);
        }
      } else if (style === 'scatter') {
        if (volumeRef.current > 0) {
          const vf = volumeRef.current * 3 * delta * 60;
          for (const dot of scatterDots) {
            const dx = dot.x - centerX; const dy = dot.y - centerY;
            const d = Math.hypot(dx, dy) || 1;
            dot.vx += (dx / d) * vf * 0.18;
            dot.vy += (dy / d) * vf * 0.18;
          }
        }
        tickDots(scatterDots, mouseRef.current, width, height, delta, visual.speed, 0, 0.91, 0.0001, true);
        renderScatter(context, scatterDots, palette, alphaScale);
      } else {
        if (volumeRef.current > 0) {
          const vf = volumeRef.current * 3 * delta * 60;
          for (const dot of networkDots) {
            const dx = dot.x - centerX; const dy = dot.y - centerY;
            const d = Math.hypot(dx, dy) || 1;
            dot.vx += (dx / d) * vf * 0.12;
            dot.vy += (dy / d) * vf * 0.12;
          }
        }
        tickDots(networkDots, mouseRef.current, width, height, delta, visual.speed, 0.006, 0.87, 0.0025, false);
        renderNetwork(context, networkDots, palette, alphaScale);
      }

      drawCore(context, centerX, centerY, palette, breathWave, thinkingWave, alphaScale, visual.coreScale);
      drawInteractionPulse(
        context,
        centerX,
        centerY,
        reactionRef.current,
        reactionStartedAtRef.current,
        timestamp,
      );

      if (rippleSettingsRef.current.enabled) {
        const alive: Ripple[] = [];
        for (const r of rippleRef.current) {
          r.radius += 240 * delta; // 4px/frame at 60fps
          r.life -= 1.5 * delta;   // 0.025/frame at 60fps → ~0.67s lifetime
          if (r.life > 0) {
            context.strokeStyle = `rgba(240, 200, 255, ${(r.life * 0.65).toFixed(3)})`;
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            context.stroke();
            alive.push(r);
          }
        }
        rippleRef.current = alive;
      }

      frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={event => {
        if (!rippleSettingsRef.current.enabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        rippleRef.current.push({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          radius: 10,
          life: 1,
        });
      }}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        mouseRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }}
      onPointerLeave={() => {
        mouseRef.current = { x: -1000, y: -1000 };
      }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  );
}
