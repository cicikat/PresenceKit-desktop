import { useEffect, useRef } from 'react';
import type { PetSnapshot } from '../../../shared/pet/types';

type Rgb = [number, number, number];

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
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = rgba([255, 255, 255], (0.9 + breathWave * 0.07) * alphaScale);
  context.beginPath();
  context.arc(centerX, centerY, 5.5 + breathWave * 1.4, 0, Math.PI * 2);
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
) {
  accent.angle += accent.speed / 60;
  const wobble = Math.sin(time * 0.8 + accent.phase) * 5;
  const radius = accent.orbitRadius + wobble;
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

export function ParticleCanvas({ snapshot }: { snapshot: PetSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

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
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (timestamp: number) => {
      const state = snapshotRef.current;
      const palette = state.thinking
        ? PALETTES.thinking
        : state.presence === 'away'
          ? PALETTES.sleepy
          : PALETTES[state.mood] ?? PALETTES['平静'];
      const alphaScale = state.presence === 'away' ? 0.54 : state.presence === 'idle' ? 0.78 : 1;
      const centerX = width / 2;
      const centerY = height / 2;
      const time = timestamp / 1000;
      const breathWave = (Math.sin(time * 1.75) + 1) / 2;
      const thinkingWave = state.thinking ? (Math.sin(time * 4.8) + 1) / 2 : 0;

      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = 'rgba(0, 0, 0, 0.86)';
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';

      for (const blob of blobs) {
        blob.angle += blob.speed / 60;
        const wobble = Math.sin(time * 0.7 + blob.phase) * 7;
        const orbit = blob.orbitRadius + wobble;
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
        const localBreath = Math.sin(time * blob.breathSpeed + blob.phase) * 2.6;
        const syncedBreath = breathWave * 5.2 + thinkingWave * 1.8;
        drawBlob(context, blob, palette, blob.size + localBreath + syncedBreath, alphaScale);
      }

      for (const accent of accents) {
        drawAccent(context, accent, centerX, centerY, palette, time, alphaScale);
      }

      drawCore(context, centerX, centerY, palette, breathWave, thinkingWave, alphaScale);
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
