import { shimCubismCore, verifyCubismCoreShim } from './cubismCoreShim';

interface CubismCoreVersionApi {
  Version?: {
    csmGetVersion?: () => number;
  };
}

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

const CORE_SRC = '/live2d/core/live2dcubismcore.min.js';
const CORE_MISSING_MESSAGE = 'Cubism Core 未找到：请将 live2dcubismcore.min.js 放到 public/live2d/core/';
const CORE_TOO_NEW_MESSAGE =
  'Cubism Core 版本过新（Core 6+ 是破坏性更新，渲染库尚不支持）：'
  + '请到 Live2D 官网下载 Cubism 5 系 SDK for Web，用其中的 live2dcubismcore.min.js 替换 public/live2d/core/ 下的文件'
  + '（垫片未能覆盖此 Core 版本）';

let corePromise: Promise<void> | null = null;

/** csmGetVersion() packs the version as (major << 24) | (minor << 16) | patch. */
function coreMajorVersion(): number | null {
  const core = window.Live2DCubismCore as CubismCoreVersionApi | undefined;
  const get = core?.Version?.csmGetVersion;
  if (typeof get !== 'function') return null;
  try {
    return get() >>> 24;
  } catch {
    return null;
  }
}

/**
 * Core 6 is an Emscripten/WASM module: the script tag's `load` event fires once the top-level JS
 * has run, but `WebAssembly.instantiate()` resolves at least one event-loop turn later — calling
 * `csmGetVersion()` right at `onload` can race and throw. Poll briefly instead of trusting the
 * first read.
 */
async function waitForVersionReady(timeoutMs = 3000): Promise<number | null> {
  const start = Date.now();
  let major = coreMajorVersion();
  while (major === null && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 10));
    major = coreMajorVersion();
  }
  return major;
}

/** Rejects when the core is absent, and when it's a Core-6+ build the shim can't fully cover. */
async function assertCoreCompatible(): Promise<void> {
  const major = await waitForVersionReady();
  if (major === null || major < 6) return;

  // Core 6 renamed/relocated a few framework-facing APIs (e.g. getDrawableRenderOrders →
  // getRenderOrders moving off `drawables` entirely) — pixi-live2d-display(-lipsyncpatch) reads
  // the old shape and crashes at draw time without the shim. See cubismCoreShim.ts.
  shimCubismCore();
  const missing = verifyCubismCoreShim();
  if (missing.length > 0) throw new Error(`${CORE_TOO_NEW_MESSAGE}（缺失：${missing.join(', ')}）`);
}

export async function ensureCubismCore(): Promise<void> {
  if (window.Live2DCubismCore) {
    await assertCoreCompatible();
    return;
  }
  if (corePromise) return corePromise;

  corePromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.onload = () => {
      assertCoreCompatible().then(resolve, (e) => {
        // Leave corePromise poisoned on purpose: the wrong core script is already evaluated
        // on window and cannot be unloaded — a retry without restart can't succeed anyway.
        reject(e);
      });
    };
    script.onerror = () => {
      corePromise = null;
      reject(new Error(CORE_MISSING_MESSAGE));
    };
    document.head.appendChild(script);
  });

  return corePromise;
}
