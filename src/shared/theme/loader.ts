import { ALL_TOKENS, REQUIRED_TOKENS } from './contract';
import type { ThemeManifest } from './types';

let appliedKeys: string[] = [];

export function validateTheme(manifest: ThemeManifest): string[] {
  return REQUIRED_TOKENS.filter(key => !(key in manifest.tokens) || !manifest.tokens[key]);
}

export function applyTheme(manifest: ThemeManifest): void {
  const root = document.documentElement;
  for (const key of appliedKeys) root.style.removeProperty(key);
  appliedKeys = [];

  for (const key of ALL_TOKENS) {
    const value = manifest.tokens[key];
    if (value != null && value !== '') {
      root.style.setProperty(key, value);
      appliedKeys.push(key);
    }
  }
  root.setAttribute('data-theme', manifest.id);
}

export function clearTheme(): void {
  const root = document.documentElement;
  for (const key of appliedKeys) root.style.removeProperty(key);
  appliedKeys = [];
  root.removeAttribute('data-theme');
}

export function applyThemeCss(id: string, cssText: string | null): void {
  document.querySelectorAll('style[data-theme-css]').forEach(el => el.remove());
  if (!cssText) return;
  const style = document.createElement('style');
  style.setAttribute('data-theme-css', id);
  style.textContent = cssText;
  document.head.appendChild(style);
}

export function clearThemeCss(): void {
  document.querySelectorAll('style[data-theme-css]').forEach(el => el.remove());
}
