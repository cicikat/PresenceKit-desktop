import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Live2DBackground { file: string; label: string }
const PREFIX = '/live2d/backgrounds/';
export function backgroundUrl(file: string): string {
  return PREFIX + file.split('/').map(encodeURIComponent).join('/');
}
export function listLive2DBackgrounds(): Promise<Live2DBackground[]> {
  return invoke('list_live2d_backgrounds');
}
export async function backgroundSource(url: string): Promise<string> {
  // Keep existing custom URLs compatible; newly selected library files use bounded native reads.
  if (!url.startsWith(PREFIX)) return url;
  const file = url.slice(PREFIX.length).split('/').map(decodeURIComponent).join('/');
  return invoke('read_live2d_background', { file });
}

/** Data only: settings reuse the existing Row/select primitives rather than a new picker UI. */
export function useLive2DBackgrounds(enabled = true) {
  const [files, setFiles] = useState<Live2DBackground[]>([]);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try {
      const next = await listLive2DBackgrounds();
      if (token === generation.current) { setFiles(next); setFailed(false); }
    } catch { if (token === generation.current) setFailed(true); }
  }, []);
  useEffect(() => { if (enabled) void refresh(); return () => { generation.current++; }; }, [enabled, refresh]);
  return { files, failed, refresh };
}
