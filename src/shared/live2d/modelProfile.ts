/** Optional, asset-owned mapping. No backend vocabulary or global model-name heuristics. */
export interface NativeAction { enter?: string; loop?: string; exit?: string }
export interface ModelProfile {
  version: 1;
  preserveNativeParameters: boolean;
  expressions: Record<string, string>;
  actions: Record<string, NativeAction>;
  hitAreas: Record<string, string>;
  motionParameters: Record<string, string[]>;
  expressionParameters: Record<string, string[]>;
}
export interface NativeMotion { file: string; group: string; index: number }

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function strings(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(object(value)).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
function parameters(value: unknown): Record<string, string[]> {
  return Object.fromEntries(Object.entries(object(value)).map(([key, ids]) =>
    [key, Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []]));
}
export function readModelProfile(value: unknown): ModelProfile | null {
  const raw = object(value);
  if (raw.version !== 1) return null;
  const actions: Record<string, NativeAction> = {};
  for (const [name, action] of Object.entries(object(raw.actions))) {
    const fields = strings(action);
    const parsed = { enter: fields.enter, loop: fields.loop, exit: fields.exit };
    if (parsed.enter || parsed.loop) actions[name] = parsed;
  }
  return { version: 1, preserveNativeParameters: raw.preserveNativeParameters === true,
    expressions: strings(raw.expressions), actions, hitAreas: strings(raw.hitAreas),
    motionParameters: parameters(raw.motionParameters), expressionParameters: parameters(raw.expressionParameters) };
}

export function listNativeMotions(definitions: unknown): NativeMotion[] {
  return Object.entries(object(definitions)).flatMap(([group, entries]) =>
    Array.isArray(entries) ? entries.flatMap((entry, index) => {
      const file = object(entry).File;
      return typeof file === 'string' ? [{ file, group, index }] : [];
    }) : []);
}

export function findNativeMotion(motions: NativeMotion[], file: string): NativeMotion | null {
  // The empty group is a valid authored group; never use truthiness to reject it.
  return motions.find(motion => motion.file === file) ?? null;
}

export function availableProfile(profile: ModelProfile | null, motions: NativeMotion[], expressions: string[]): ModelProfile | null {
  if (!profile) return null;
  const files = new Set(motions.map(motion => motion.file));
  const actions = Object.fromEntries(Object.entries(profile.actions).filter(([, action]) =>
    Object.values(action).filter((file): file is string => typeof file === 'string').every(file => files.has(file))));
  return { ...profile, actions,
    expressions: Object.fromEntries(Object.entries(profile.expressions).filter(([, name]) => expressions.includes(name))),
    hitAreas: Object.fromEntries(Object.entries(profile.hitAreas).filter(([, action]) => Object.prototype.hasOwnProperty.call(actions, action))) };
}

export function expressionFor(profile: ModelProfile | null, semantic: string, available: string[]): string | null {
  const target = profile?.expressions[semantic];
  return target && available.includes(target) ? target : null;
}

export function protectedParameters(profile: ModelProfile | null, motion: string | null, expression: string | null): Set<string> {
  if (!profile?.preserveNativeParameters) return new Set();
  return new Set([...(motion ? profile.motionParameters[motion] ?? [] : []),
    ...(expression ? profile.expressionParameters[expression] ?? [] : [])]);
}
