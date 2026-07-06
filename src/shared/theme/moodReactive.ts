import type { Mood } from '../state/store';
import { MOOD_TABLE } from '../state/store';

export interface MoodReactivePrefs {
  enabled: boolean;
  intensity: number; // 0–1
}

export const DEFAULT_MOOD_REACTIVE: MoodReactivePrefs = {
  enabled: false,
  intensity: 0.5,
};

interface MoodShift {
  hueShift: number;   // degrees, added to base hue
  chromaMul: number;  // multiplier on chroma
  lightMul: number;   // multiplier on lightness delta
  targetVars: string[];
}

const MOOD_THEME_SHIFT: Record<Mood, MoodShift> = {
  '平静': { hueShift: 0,    chromaMul: 1.0,  lightMul: 1.0, targetVars: ['--accent', '--accent-2', '--forest', '--forest-2'] },
  '开心': { hueShift: 20,   chromaMul: 1.2,  lightMul: 1.05, targetVars: ['--accent', '--accent-2', '--paper-grain-1'] },
  '低落': { hueShift: 180,  chromaMul: 0.7,  lightMul: 0.96, targetVars: ['--accent', '--accent-2', '--forest', '--forest-2'] },
  '病娇': { hueShift: -15,  chromaMul: 1.3,  lightMul: 1.0,  targetVars: ['--accent', '--accent-2', '--paper-grain-1', '--paper-grain-2'] },
  '分心': { hueShift: 55,   chromaMul: 0.85, lightMul: 0.98, targetVars: ['--accent', '--forest-2'] },
  '生气': { hueShift: -20,  chromaMul: 1.35, lightMul: 1.0,  targetVars: ['--accent', '--accent-2', '--paper-grain-1'] },
  '惊讶': { hueShift: 30,   chromaMul: 1.15, lightMul: 1.06, targetVars: ['--accent', '--accent-2'] },
};

let appliedVars: Set<string> = new Set();
let suspended = false;
let lastArgs: { mood: Mood; intensity: number } | null = null;

// Overlay writes land on the same inline `style` object the theme itself uses, so a
// naive "read current computed value" would read our own previous shift on the next
// tick and compound it. Cache the true base once per clean (unshifted) state instead.
let baseSnapshot: Map<string, string> = new Map();

// ── oklch parsing ────────────────────────────────────────────────────────────

function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } | null {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return {
    l: parseFloat(m[1]),
    c: parseFloat(m[2]),
    h: parseFloat(m[3]),
    alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

function resolveTokenValue(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function resolveBaseValue(varName: string): string {
  const cached = baseSnapshot.get(varName);
  if (cached !== undefined) return cached;
  const value = resolveTokenValue(varName);
  baseSnapshot.set(varName, value);
  return value;
}

/** Call after the underlying theme's own tokens change so the next overlay shifts from the new base, not a stale/shifted one. */
export function resetMoodOverlayBase(): void {
  baseSnapshot.clear();
}

// ── Overlay computation ──────────────────────────────────────────────────────

export function computeMoodOverrides(
  mood: Mood,
  intensity: number,
): Record<string, string> {
  const shift = MOOD_THEME_SHIFT[mood];
  if (!shift || shift.hueShift === 0 && shift.chromaMul === 1 && shift.lightMul === 1) return {};

  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  // Scale shift by intensity — guards ensure output stays readable
  const hueShift  = Math.max(-25, Math.min(25,  shift.hueShift  * clampedIntensity));
  const chromaMul = 0.6 + (Math.min(1.4, shift.chromaMul) - 0.6) * clampedIntensity + (1 - clampedIntensity) * 0.4;
  const lightMul  = 1 + (shift.lightMul - 1) * clampedIntensity;

  const overrides: Record<string, string> = {};
  for (const varName of shift.targetVars) {
    const raw = resolveBaseValue(varName);
    if (!raw) continue;

    const parsed = parseOklch(raw);
    if (parsed) {
      const newH = (parsed.h + hueShift + 360) % 360;
      const newC = Math.max(0, Math.min(0.4, parsed.c * chromaMul));
      const newL = Math.max(0.05, Math.min(0.98, parsed.l * lightMul));
      const alpha = parsed.alpha < 1 ? ` / ${parsed.alpha}` : '';
      overrides[varName] = `oklch(${newL.toFixed(3)} ${newC.toFixed(3)} ${newH.toFixed(1)}${alpha})`;
    }
  }
  return overrides;
}

// ── Apply / clear ────────────────────────────────────────────────────────────

export function applyMoodOverlay(mood: Mood, intensity: number): void {
  lastArgs = { mood, intensity };
  if (suspended) return;

  const overrides = computeMoodOverrides(mood, intensity);
  const root = document.documentElement;

  // Clear vars no longer in the new override set
  for (const v of appliedVars) {
    if (!(v in overrides)) root.style.removeProperty(v);
  }
  appliedVars = new Set(Object.keys(overrides));

  for (const [prop, value] of Object.entries(overrides)) {
    root.style.setProperty(prop, value);
  }
}

export function clearMoodOverlay(): void {
  const root = document.documentElement;
  for (const v of appliedVars) {
    root.style.removeProperty(v);
  }
  appliedVars = new Set();
  baseSnapshot.clear();
}

/** Suspend overlay writes without losing the enabled/intensity state (e.g. while ChatColorPage is editing the very tokens the overlay would overwrite). */
export function suspendMoodOverlay(): void {
  suspended = true;
  clearMoodOverlay();
}

export function resumeMoodOverlay(): void {
  suspended = false;
  if (lastArgs) applyMoodOverlay(lastArgs.mood, lastArgs.intensity);
}

// Kept for reference by callers that want the aura hue from MOOD_TABLE
export function moodAuraHue(mood: Mood): number {
  return MOOD_TABLE[mood]?.auraHue ?? 70;
}
