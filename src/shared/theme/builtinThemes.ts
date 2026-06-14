import type { ThemeManifest } from './types';
import { REQUIRED_TOKENS } from './contract';

function defineBuiltinTheme(manifest: ThemeManifest): ThemeManifest {
  const missing = REQUIRED_TOKENS.filter(key => !manifest.tokens[key]);
  if (missing.length > 0) console.warn(`[theme] 内置主题 "${manifest.id}" 缺少必需变量:`, missing);
  return manifest;
}

const shapeTokens = {
  '--radius-xs': '3px',
  '--radius-sm': '5px',
  '--radius-md': '8px',
  '--radius-lg': '12px',
  '--radius-pill': '999px',
  '--border-thin': '1px',
  '--border-regular': '2px',
};

const gameTokens = {
  '--board-light': '#f0d9b5',
  '--board-dark': '#b58863',
  '--board-select': '#f6f669',
  '--board-target-light': '#cdd16f',
  '--board-target-dark': '#aaa23a',
  '--board-coord-light': '#b58863',
  '--board-coord-dark': '#f0d9b5',
  '--goban-bg': '#dcb967',
  '--goban-line': '#8b6914',
  '--stone-black-core': '#555',
  '--stone-black-edge': '#111',
  '--stone-white-core': '#fff',
  '--stone-white-edge': '#ccc',
  '--stone-black-border': '#000',
  '--stone-white-border': '#999',
  '--status-connecting': '#f0b429',
  '--status-error': '#e53e3e',
  '--flower-calm': '#d4a958',
  '--flower-bright': '#d97f3a',
  '--flower-low': '#5b9bd5',
  '--flower-yandere': '#c25a5a',
  '--flower-adrift': '#9a7fc4',
  '--flower-default': '#8a8a8a',
};

const paperDreamTokens = {
  '--dt-bg-1': 'oklch(0.972 0.012 80)',
  '--dt-bg-2': 'oklch(0.945 0.022 310)',
  '--dt-bg-3': 'oklch(0.958 0.018 200)',
  '--dt-surface': 'oklch(1 0 0 / 0.50)',
  '--dt-surface-2': 'oklch(1 0 0 / 0.32)',
  '--dt-surface-deep': 'oklch(0.96 0.012 295 / 0.55)',
  '--dt-ink': 'oklch(0.30 0.018 280)',
  '--dt-ink-2': 'oklch(0.46 0.020 280)',
  '--dt-ink-3': 'oklch(0.62 0.022 280)',
  '--dt-ink-4': 'oklch(0.78 0.020 280)',
  '--dt-flower-daisy': 'oklch(0.86 0.10 80)',
  '--dt-flower-rose': 'oklch(0.82 0.11 18)',
  '--dt-flower-dandelion': 'oklch(0.82 0.10 295)',
  '--dt-flower-bluebell': 'oklch(0.84 0.08 230)',
  '--dt-flower-sun': 'oklch(0.88 0.10 55)',
  '--dt-border': 'oklch(1 0 0 / 0.55)',
  '--dt-border-soft': 'oklch(0.78 0.020 280 / 0.35)',
  '--dt-blur-sm': '8px',
  '--dt-blur-md': '18px',
  '--dt-blur-lg': '34px',
  '--dt-shadow-rest': '0 6px 18px oklch(0.45 0.04 280 / 0.08), 0 1px 0 oklch(1 0 0 / 0.6) inset',
  '--dt-shadow-glow': '0 14px 44px oklch(0.78 0.10 295 / 0.18)',
  '--dt-shadow-bloom': '0 0 32px oklch(0.85 0.10 295 / 0.35)',
  '--dt-glow-warm': '0 0 28px oklch(0.86 0.10 80 / 0.35)',
  '--dt-glow-cool': '0 0 28px oklch(0.84 0.08 230 / 0.35)',
  '--dt-glow-soft': '0 0 28px oklch(0.82 0.10 295 / 0.30)',
  '--dt-glow-glass-bg': 'rgb(255 255 255 / 0.44)',
  '--dt-glow-glass-border': 'rgb(190 210 255 / 0.62)',
  '--dt-glow-glass-shadow': '0 0 18px rgb(156 185 255 / 0.22), inset 0 0 18px rgb(190 210 255 / 0.12)',
  '--dt-glow-glass-sheen': 'rgb(210 230 255 / 0.42)',
  '--dt-glow-glass-blur': '14px',
  '--dt-glow-bubble-bg': 'rgb(234 238 250 / 0.34)',
  '--dt-glow-bubble-border': 'rgb(190 210 255 / 0.76)',
  '--dt-glow-bubble-shadow': '0 0 9px rgb(156 185 255 / 0.16), inset 0 0 14px rgb(190 210 255 / 0.11)',
  '--dt-anim-breath': '6.5s ease-in-out infinite',
  '--dt-anim-drift': '22s linear infinite',
  '--dt-anim-bloom': '1.6s cubic-bezier(0.2, 0.7, 0.2, 1)',
  '--dt-anim-slow': '0.9s cubic-bezier(0.4, 0, 0.2, 1)',
  '--dt-accent-rose': '#e96c6c',
  '--dt-accent-violet': '#b97fe8',
  '--dt-accent-azure': '#7fbfe8',
};

const darkDreamTokens = {
  ...paperDreamTokens,
  '--dt-bg-1': '#0b1020',
  '--dt-bg-2': '#11182b',
  '--dt-bg-3': '#151d32',
  '--dt-surface': 'rgb(18 26 46 / 0.72)',
  '--dt-surface-2': 'rgb(42 53 87 / 0.52)',
  '--dt-surface-deep': 'rgb(18 26 46 / 0.76)',
  '--dt-ink': '#d9dce8',
  '--dt-ink-2': '#a7aec3',
  '--dt-ink-3': 'rgb(167 174 195 / 0.72)',
  '--dt-ink-4': 'rgb(167 174 195 / 0.48)',
  '--dt-border': 'rgb(124 184 255 / 0.34)',
  '--dt-border-soft': 'rgb(124 184 255 / 0.18)',
  '--dt-glow-glass-bg': 'rgb(28 35 65 / 0.42)',
  '--dt-glow-bubble-bg': 'rgb(28 34 58 / 0.48)',
};

export const PAPER_THEME: ThemeManifest = defineBuiltinTheme({
  id: 'paper',
  name: '复古信纸',
  author: 'Emerald',
  version: '1.0.0',
  base: 'light',
  tokens: {
    '--paper': 'oklch(0.945 0.018 75)', '--paper-2': 'oklch(0.918 0.022 72)', '--paper-3': 'oklch(0.885 0.026 70)', '--paper-edge': 'oklch(0.78 0.030 65)',
    '--ink': 'oklch(0.22 0.018 55)', '--ink-2': 'oklch(0.38 0.018 55)', '--ink-3': 'oklch(0.55 0.020 60)', '--ink-4': 'oklch(0.70 0.020 60)',
    '--forest': 'oklch(0.320 0.048 168)', '--forest-1': 'oklch(0.270 0.048 168)', '--forest-2': 'oklch(0.395 0.055 168)', '--forest-3': 'oklch(0.48 0.060 168)', '--forest-line': 'oklch(0.43 0.040 168)',
    '--on-forest': 'oklch(0.94 0.025 95)', '--on-forest-2': 'oklch(0.74 0.060 95)',
    '--accent': 'oklch(0.60 0.165 30)', '--accent-2': 'oklch(0.72 0.130 78)', '--accent-3': 'oklch(0.55 0.090 145)', '--danger': 'oklch(0.58 0.180 25)',
    '--paper-grain-1': 'oklch(0.95 0.02 60 / 0.6)', '--paper-grain-2': 'oklch(0.90 0.03 50 / 0.5)', '--shadow-rgb-mix': 'oklch(0.30 0.04 60 / 0.18)',
    ...shapeTokens,
    ...gameTokens,
    ...paperDreamTokens,
  },
});

export const DARK_THEME: ThemeManifest = defineBuiltinTheme({
  id: 'dark',
  name: '深色护眼',
  author: 'Emerald',
  version: '1.0.0',
  base: 'dark',
  tokens: {
    '--paper': 'oklch(0.165 0.012 60)', '--paper-2': 'oklch(0.205 0.014 60)', '--paper-3': 'oklch(0.245 0.016 60)', '--paper-edge': 'oklch(0.30 0.020 60)',
    '--ink': 'oklch(0.92 0.012 75)', '--ink-2': 'oklch(0.72 0.015 75)', '--ink-3': 'oklch(0.55 0.015 75)', '--ink-4': 'oklch(0.40 0.015 75)',
    '--forest': 'oklch(0.21 0.04 168)', '--forest-1': 'oklch(0.165 0.04 168)', '--forest-2': 'oklch(0.31 0.05 168)', '--forest-3': 'oklch(0.38 0.06 168)', '--forest-line': 'oklch(0.33 0.04 168)',
    '--on-forest': 'oklch(0.92 0.025 95)', '--on-forest-2': 'oklch(0.70 0.050 95)',
    '--accent': 'oklch(0.72 0.155 32)', '--accent-2': 'oklch(0.78 0.130 78)', '--accent-3': 'oklch(0.65 0.110 145)', '--danger': 'oklch(0.70 0.180 25)',
    '--paper-grain-1': 'oklch(0.30 0.05 60 / 0.30)', '--paper-grain-2': 'oklch(0.20 0.04 50 / 0.25)', '--shadow-rgb-mix': 'oklch(0 0 0 / 0.55)',
    ...shapeTokens,
    ...gameTokens,
    '--board-light': '#b7a37f', '--board-dark': '#76583f', '--board-select': '#9b9842',
    '--board-target-light': '#858b50', '--board-target-dark': '#6d692d',
    '--goban-bg': '#8f713e', '--goban-line': '#44320d',
    ...darkDreamTokens,
  },
});

export const BUILTIN_THEMES: ThemeManifest[] = [PAPER_THEME, DARK_THEME];
