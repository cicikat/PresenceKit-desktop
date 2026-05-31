import { useEffect, useRef } from 'react';
import type { PetSnapshot } from '../../../shared/pet/types';

type Rgb = [number, number, number];

interface Palette {
  primary: Rgb;
  secondary: Rgb;
  glow: Rgb;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  radius: number;
  phase: number;
}

const PALETTES: Record<string, Palette> = {
  '平静': { primary: [180, 140, 255], secondary: [210, 185, 255], glow: [255, 255, 255] },
  '开心': { primary: [255, 80, 180], secondary: [255, 120, 200], glow: [255, 60, 140] },
  '低落': { primary: [80, 80, 200], secondary: [100, 100, 220], glow: [60, 60, 180] },
  '病娇': { primary: [100, 0, 255], secondary: [80, 0, 200], glow: [130, 40, 255] },
  '分心': { primary: [165, 145, 215], secondary: [190, 175, 230], glow: [205, 195, 245] },
  '生气': { primary: [235, 62, 75], secondary: [255, 115, 92], glow: [255, 65, 55] },
  '惊讶': { primary: [255, 200, 50], secondary: [255, 220, 120], glow: [255, 160, 0] },
  thinking: { primary: [220, 220, 220], secondary: [180, 180, 180], glow: [255, 255, 255] },
  sleepy: { primary: [60, 80, 180], secondary: [80, 100, 200], glow: [40, 60, 160] },
};

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

function makeParticles(width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  for (const [ringRadius, count] of [[34, 6], [68, 11], [104, 15], [132, 11]] as const) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.35;
      const radius = ringRadius + Math.random() * 12;
      const homeX = centerX + Math.cos(angle) * radius;
      const homeY = centerY + Math.sin(angle) * radius;
      particles.push({
        x: homeX,
        y: homeY,
        vx: 0,
        vy: 0,
        homeX,
        homeY,
        radius: 1.7 + Math.random() * 3.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }
  return particles;
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
    let particles: Particle[] = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = makeParticles(width, height);
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
      const alphaScale = state.presence === 'away' ? 0.5 : state.presence === 'idle' ? 0.76 : 1;
      const centerX = width / 2;
      const centerY = height / 2;
      const time = timestamp / 1000;

      context.clearRect(0, 0, width, height);
      for (const point of particles) {
        point.vx += (point.homeX - point.x) * 0.009;
        point.vy += (point.homeY - point.y) * 0.009;
        point.vx += Math.sin(time * 1.35 + point.phase) * 0.012;
        point.vy += Math.cos(time * 1.1 + point.phase) * 0.012;
        const dx = point.x - mouseRef.current.x;
        const dy = point.y - mouseRef.current.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 56) {
          const force = 1.35 * (1 - distance / 56);
          point.vx += (dx / distance) * force;
          point.vy += (dy / distance) * force;
        }
        point.vx *= 0.88;
        point.vy *= 0.88;
        point.x += point.vx;
        point.y += point.vy;
      }

      context.lineWidth = 1;
      for (let left = 0; left < particles.length; left += 1) {
        for (let right = left + 1; right < particles.length; right += 1) {
          const a = particles[left];
          const b = particles[right];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance >= 78) continue;
          context.strokeStyle = rgba(palette.secondary, (1 - distance / 78) * 0.36 * alphaScale);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      for (const point of particles) {
        context.fillStyle = rgba(palette.primary, 0.18 * alphaScale);
        context.beginPath();
        context.arc(point.x, point.y, point.radius * 2.8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = rgba(palette.primary, 0.88 * alphaScale);
        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
      }

      const pulse = 17 + Math.sin(time * 2.5) * 3;
      const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulse * 4);
      core.addColorStop(0, rgba(palette.glow, 0.96 * alphaScale));
      core.addColorStop(0.22, rgba(palette.glow, 0.45 * alphaScale));
      core.addColorStop(1, rgba(palette.glow, 0));
      context.fillStyle = core;
      context.beginPath();
      context.arc(centerX, centerY, pulse * 4, 0, Math.PI * 2);
      context.fill();

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
