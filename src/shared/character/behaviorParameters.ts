/** Small runtime-only motion/feedback controls. Radians, seconds, model units. */
export const CHARACTER_BEHAVIOR = {
  head: { idleInterval: [5, 13], speechInterval: [1.8, 4.5], yaw: 0.045, pitch: 0.025, roll: 0.009, inertia: 0.24 },
  body: { idleInterval: [8, 19], speechInterval: [3.5, 7], roll: 0.012, yaw: 0.008, shoulder: 0.0008, damping: 0.3 },
  envelope: { attack: [0.6, 1.1], hold: [0.3, 1.7], release: [0.9, 1.6] },
  thinking: { pitch: 0.045, yaw: 0.020, attack: 0.8, hold: 1.2, release: 1.2, duration: 3.2 },
  speech: { damping: 0.4, gain: 0.35 },
  breathing: { maxDepth: 0.006, position: 0.06, scale: 0.5, shoulder: 0.00015 },
  feedback: { requestTtlMs: 90000, streamTtlMs: 30000, audioTtlMs: 180000,
    textMinMs: 1800, textMaxMs: 8000, textCharMs: 65, streamEndMs: 800,
    emotionTtlMs: 120000, maxEntries: 128 },
} as const;
