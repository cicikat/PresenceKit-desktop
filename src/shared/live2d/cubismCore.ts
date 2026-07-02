declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

const CORE_SRC = '/live2d/core/live2dcubismcore.min.js';
const CORE_MISSING_MESSAGE = 'Cubism Core 未找到：请将 live2dcubismcore.min.js 放到 public/live2d/core/';

let corePromise: Promise<void> | null = null;

export async function ensureCubismCore(): Promise<void> {
  if (window.Live2DCubismCore) return;
  if (corePromise) return corePromise;

  corePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      corePromise = null;
      reject(new Error(CORE_MISSING_MESSAGE));
    };
    document.head.appendChild(script);
  });

  return corePromise;
}
