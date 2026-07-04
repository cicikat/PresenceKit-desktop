/**
 * Cubism Core 6 renamed/relocated a handful of framework-facing fields relative to Core 5
 * (official changelog: `getDrawableRenderOrders` → `getRenderOrders`, etc). The renderer
 * (pixi-live2d-display-lipsyncpatch's cubism4.es.js) is built against the old shapes and
 * crashes at draw time when they're missing. Core itself is a pure data interface (moc parsing /
 * parameter update / vertex data) — this shim patches the Core 6 namespace so the old shapes
 * exist alongside the new ones, restoring the surface documented in cc-tasks/11-cubism-core6-shim.md §0.
 *
 * Probed against Core 6.0.1 (`csmGetVersion() === 0x06000001`) + a Cubism-5 moc3 (ren): the ONLY
 * gap is `model.drawables.renderOrders`, which moved to `model.renderOrders` (also reachable via
 * `model.getRenderOrders()` — same typed-array reference, stable across `model.update()`).
 * Everything else in §0 (Utils.hasXBit×10, Version/Logging/Memory/Moc/Model, parameters/parts/
 * canvasinfo fields, the rest of drawables) is present unchanged.
 */

interface CubismCoreNamespace {
  Version?: { csmGetVersion?: () => number; csmGetMocVersion?: unknown; csmGetLatestMocVersion?: unknown };
  Logging?: { csmSetLogFunction?: unknown; csmGetLogFunction?: unknown };
  Memory?: { initializeAmountOfMemory?: unknown };
  Moc?: { fromArrayBuffer?: unknown; prototype?: { _release?: unknown } };
  Model?: { fromMoc?: (moc: unknown) => CubismModelInstance };
  Utils?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CubismModelInstance {
  drawables?: { renderOrders?: unknown; [key: string]: unknown };
  renderOrders?: unknown;
  [key: string]: unknown;
}

const REQUIRED_UTILS_BITS = [
  'hasIsDoubleSidedBit',
  'hasVertexPositionsDidChangeBit',
  'hasBlendAdditiveBit',
  'hasBlendMultiplicativeBit',
  'hasIsInvertedMaskBit',
  'hasIsVisibleBit',
  'hasVisibilityDidChangeBit',
  'hasOpacityDidChangeBit',
  'hasRenderOrderDidChangeBit',
  'hasBlendColorDidChangeBit',
] as const;

function getCore(): CubismCoreNamespace | undefined {
  return (window as unknown as { Live2DCubismCore?: CubismCoreNamespace }).Live2DCubismCore;
}

function coreMajorVersion(core: CubismCoreNamespace): number | null {
  const get = core.Version?.csmGetVersion;
  if (typeof get !== 'function') return null;
  try {
    return get() >>> 24;
  } catch {
    return null;
  }
}

/** Namespace-level surface that's checkable without creating a Model instance (§0 checklist). */
function missingNamespaceFields(core: CubismCoreNamespace): string[] {
  const missing: string[] = [];
  if (typeof core.Logging?.csmSetLogFunction !== 'function') missing.push('Logging.csmSetLogFunction');
  if (typeof core.Logging?.csmGetLogFunction !== 'function') missing.push('Logging.csmGetLogFunction');
  if (typeof core.Version?.csmGetVersion !== 'function') missing.push('Version.csmGetVersion');
  if (typeof core.Version?.csmGetMocVersion !== 'function') missing.push('Version.csmGetMocVersion');
  if (typeof core.Version?.csmGetLatestMocVersion !== 'function') missing.push('Version.csmGetLatestMocVersion');
  if (typeof core.Memory?.initializeAmountOfMemory !== 'function') missing.push('Memory.initializeAmountOfMemory');
  if (typeof core.Moc?.fromArrayBuffer !== 'function') missing.push('Moc.fromArrayBuffer');
  if (typeof core.Moc?.prototype?._release !== 'function') missing.push('Moc.prototype._release');
  if (typeof core.Model?.fromMoc !== 'function') missing.push('Model.fromMoc');
  for (const bit of REQUIRED_UTILS_BITS) {
    if (typeof core.Utils?.[bit] !== 'function') missing.push(`Utils.${bit}`);
  }
  return missing;
}

let shimmedNamespace: CubismCoreNamespace | null = null;

/**
 * Idempotent; no-op for Core ≤5 (zero pollution of the working path). For Core 6+, wraps
 * `Model.fromMoc` so returned instances carry `drawables.renderOrders` aliased from the
 * relocated `model.renderOrders`. Direct reference assignment (not a getter) is safe here because
 * probing showed the typed-array reference survives `model.update()` unchanged; if a future
 * Core 6.x rebuilds the view per-update, this alias would go stale and needs to become a getter.
 */
export function shimCubismCore(): void {
  const core = getCore();
  if (!core) return;
  if (shimmedNamespace === core) return;

  const major = coreMajorVersion(core);
  if (major === null || major <= 5) return;

  shimmedNamespace = core;
  let patched = 0;

  const Model = core.Model;
  if (Model && typeof Model.fromMoc === 'function') {
    const originalFromMoc = Model.fromMoc.bind(Model);
    Model.fromMoc = (moc: unknown) => {
      const model = originalFromMoc(moc);
      if (model?.drawables && model.drawables.renderOrders === undefined && model.renderOrders !== undefined) {
        model.drawables.renderOrders = model.renderOrders;
      }
      return model;
    };
    patched++;
  }

  console.info(`[live2d] core6 shim: patched ${patched} field(s)`);
}

/** Namespace-level self-check for `assertCoreCompatible()`; empty array = shim covers this Core build. */
export function verifyCubismCoreShim(): string[] {
  const core = getCore();
  if (!core) return ['Live2DCubismCore'];
  return missingNamespaceFields(core);
}
