/** Single source of truth for theme mod CSS variables. */
export const CORE_TOKENS = [
  '--paper', '--paper-2', '--paper-3', '--paper-edge',
  '--ink', '--ink-2', '--ink-3', '--ink-4',
  '--forest', '--forest-1', '--forest-2', '--forest-3', '--forest-line',
  '--on-forest', '--on-forest-2',
  '--accent', '--accent-2', '--accent-3', '--danger',
  '--paper-grain-1', '--paper-grain-2', '--shadow-rgb-mix',
] as const;

export const FONT_TOKENS = ['--font-serif', '--font-sans', '--font-mono'] as const;

export const GAME_TOKENS = [
  '--board-light', '--board-dark', '--board-select', '--board-target-light', '--board-target-dark',
  '--board-coord-light', '--board-coord-dark',
  '--goban-bg', '--goban-line', '--stone-black-core', '--stone-black-edge',
  '--stone-white-core', '--stone-white-edge', '--stone-black-border', '--stone-white-border',
  '--status-connecting', '--status-error',
  '--flower-calm', '--flower-bright', '--flower-low', '--flower-yandere', '--flower-adrift', '--flower-default',
] as const;

export const DREAM_TOKENS = [
  '--dt-bg-1', '--dt-bg-2', '--dt-bg-3',
  '--dt-surface', '--dt-surface-2', '--dt-surface-deep',
  '--dt-ink', '--dt-ink-2', '--dt-ink-3', '--dt-ink-4',
  '--dt-flower-daisy', '--dt-flower-rose', '--dt-flower-dandelion', '--dt-flower-bluebell', '--dt-flower-sun',
  '--dt-border', '--dt-border-soft',
  '--dt-blur-sm', '--dt-blur-md', '--dt-blur-lg',
  '--dt-shadow-rest', '--dt-shadow-glow', '--dt-shadow-bloom',
  '--dt-glow-warm', '--dt-glow-cool', '--dt-glow-soft',
  '--dt-glow-glass-bg', '--dt-glow-glass-border', '--dt-glow-glass-shadow', '--dt-glow-glass-sheen', '--dt-glow-glass-blur',
  '--dt-glow-bubble-bg', '--dt-glow-bubble-border', '--dt-glow-bubble-shadow',
  '--dt-anim-breath', '--dt-anim-drift', '--dt-anim-bloom', '--dt-anim-slow',
  '--dt-accent-rose', '--dt-accent-violet', '--dt-accent-azure',
] as const;

export const SHAPE_TOKENS = [
  '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill',
  '--border-thin', '--border-regular',
] as const;

export const MOTION_TOKENS = [
  '--motion-fast', '--motion-base', '--motion-slow',
  '--ease-standard', '--ease-emphasized',
  '--motion-scale',
] as const;

export const REQUIRED_TOKENS = [...CORE_TOKENS, ...GAME_TOKENS, ...SHAPE_TOKENS] as const;
export const OPTIONAL_TOKENS = [...FONT_TOKENS, ...DREAM_TOKENS, ...MOTION_TOKENS] as const;
export const ALL_TOKENS = [...REQUIRED_TOKENS, ...OPTIONAL_TOKENS] as const;

export type TokenName = (typeof ALL_TOKENS)[number];
