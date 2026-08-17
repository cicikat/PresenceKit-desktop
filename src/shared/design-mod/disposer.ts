export interface ResourceDisposer {
  add(cleanup: () => void): () => void;
  dispose(): void;
  get disposed(): boolean;
}

export function createResourceDisposer(): ResourceDisposer {
  let disposed = false;
  const cleanups = new Set<() => void>();
  return {
    add(cleanup) {
      if (disposed) { cleanup(); return () => {}; }
      let active = true;
      const once = () => { if (!active) return; active = false; cleanups.delete(once); cleanup(); };
      cleanups.add(once);
      return once;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of [...cleanups]) cleanup();
      cleanups.clear();
    },
    get disposed() { return disposed; },
  };
}

export function createObjectUrlFromBase64(response: { mime?: string; base64: string }, onRevoke: (url: string) => void): string {
  const binary = Uint8Array.from(atob(response.base64), character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([binary], { type: response.mime || 'application/octet-stream' }));
  onRevoke(url);
  return url;
}
