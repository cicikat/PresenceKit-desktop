import type { TokenName } from './contract';

export interface ThemeManifest {
  id: string;
  name: string;
  author?: string;
  version?: string;
  base?: 'light' | 'dark';
  css?: string;
  tokens: Partial<Record<TokenName, string>> & Record<string, string>;
}

export type ThemeSource = 'builtin' | 'disk' | 'design-mod';

export interface ThemeRecord {
  manifest: ThemeManifest;
  source: ThemeSource;
  cssText?: string;
  invalid?: { reasons: string[] };
}
