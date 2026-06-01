import { invoke } from '@tauri-apps/api/core';

export interface UserFontOption {
  fileName: string;
  label: string;
  url: string;
}

export async function listUserFonts<T extends UserFontOption>(): Promise<T[]> {
  return invoke<T[]>('list_dream_fonts');
}

export function userFontFamily(prefix: string, fileName: string | null): string | null {
  if (!fileName) return null;
  return `${prefix}-${fileName.replace(/[^a-z0-9]+/gi, '-')}`;
}

export function userFontUrl(fileName: string): string {
  return `/fonts/${encodeURIComponent(fileName)}`;
}
