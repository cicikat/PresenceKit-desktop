# Character performance baseline (CA-00)

Status: **partial**. Source audit and anonymous structural fixtures were completed against
desktop baseline `e6e576e092a392bbf55c42b64788131e97bfd0d6` on 2026-09-29.
Real Room/Pet window behavior, material appearance and frame measurements are **not-run**.
The fixtures are intentionally geometric proxies; they cannot prove usable skin weights,
facial art, material fidelity or natural posture.

## Reproducible fixtures

Run `node scripts/generate-character-baselines.mjs`, then
`npx.cmd vitest run tests/fixtures/characters.test.ts`. The six generated GLBs live in
`tests/fixtures/characters/` and contain no private character asset. The test uses the
same Three.js GLTFLoader as the client, not a hand-written JSON assertion.

| File | Intended distinction | Parsed capabilities |
| --- | --- | --- |
| `plain.glb` | Legacy ordinary GLB | no bones, morphs or clips |
| `morph-only.glb` | Morph-only fallback | one `eyeLookRight` target, no bones |
| `full-standard.glb` | Full humanoid candidate | 21 bones, one morph, one idle clip |
| `full-alternate.glb` | Different names, axis and scale | 21 `Joint_*` bones, rotated/scaled root, one idle clip |
| `morph-no-eye-bones.glb` | Missing eye bones | 19 bones, eye morph, one idle clip |
| `half-no-eyes.glb` | Upper-body downgrade | 13 bones, no eyes, one idle clip |

These samples validate loading, capability detection and degradation paths. Their weights
are deliberately uniform and they are unsuitable for visual retargeting or IK acceptance.
Any private source model stays outside version control; the user must explicitly select
it for visual acceptance and record only a local, untracked reference.

## Current versus planned

| Area | Current source evidence | Planned work |
| --- | --- | --- |
| Asset input | `roomAssets.ts` / `src-tauri/src/lib.rs` list and read single `.glb` files, with writable release assets ahead of bundled defaults | CA-01/07 directory package, then ZIP |
| Room | `useRoomScene.ts` selects an idle GLB clip and combines morphs, procedural bones and spring chains | CA-02 shared performance instance |
| Pet | `useCharacterRig.ts` drives morphs and a few bones without a clip mixer | CA-02 clip parity |
| Bone mapping | `boneResolver.ts` resolves seven roles; eye bones are found but gaze writes `eyeLook*` morphs | CA-03/04 humanoid and calibrated bone gaze |
| Clip ownership | `clipPlayer.ts` drops head, eye and spring tracks from the selected clip | CA-05 explicit per-action ownership |
| Expressions | `morphController.ts` broadcasts a key to every mesh with that key | CA-04 mesh-specific semantic binding |
| Configuration | The current importer does not read `character.json`; `roomSettings.ts` is a local setting | CA-01 one versioned contract |

## Behavior baseline to capture in real windows

Use the same selected model and client commit in both Room and Pet. Record a short video
of: neutral, each supported expression, blink, speech mouth, gaze in four directions,
head turn, breathing, idle, hair motion, model replacement, hide/show and close/reopen.
For each observation record `pass`, `fail`, or `not-run`; console bone names alone are
not proof of motion. As of this entry every real-window observation is **not-run**.

## Reference scene and measurement protocol

The CA-06 comparison scene will use a 1280×720 viewport, 60° perspective camera,
model at origin at 1.6 m display height, camera at `(0, 1.4, 3)`, target `(0, 0.8, 0)`,
sRGB output, a white ambient light at intensity 0.5, key at `(2, 3, 3)` intensity 0.9,
and fill at `(-2, 1, 1)` intensity 0.6. Lock tone mapping, exposure and background
before taking comparison images. This is a **specified reference**, not an implemented
preview or a claim of Blender/Room/Pet visual parity.

For performance, collect device class (CPU/GPU/RAM), OS, display scale, viewport,
model triangle/texture/bone/material counts, package bytes, cold load time, CPU and GPU
frame distributions, and 10-minute memory trend for Room alone, Pet alone and both
windows. Measure at least 600 warmed frames per condition; report median and p95,
plus first-load time and peak memory. Record the exact client and asset revisions.
The device, measurements and defensible limits are **not-run/unset**. CA-06/08 must set
budget thresholds from this baseline before claiming performance acceptance.

Evidence destination: `docs/runtime-acceptance-matrix.json` for machine-readable
statuses and a task-specific local evidence directory for screenshots, videos and logs.
No private asset content or machine-specific absolute path belongs in tracked evidence.
