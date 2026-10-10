# TV screen contract v1

Status: implementation contract, runtime acceptance pending. Requirements define this contract; GLB only supplies binding identifiers. Source geometry/UV need no retrofit.

Opt-in sidecar `<model>.screen.json`, schemaVersion `1.0.0`, beside GLB. Target `node` and `materialName` must match one mesh/material slot; optional `slot` disambiguates. No naming heuristic and no global character capability changes. Room owns this driver; Pet remains unchanged.

`clips` maps IDs to `image {uri}`, `sequence {frames:[{uri,durationMs}],loop,endBehavior:hold|neutral}`, or `procedural {preset:thinkingDots|spectrumBars|heartPulse,base,fallback}`. `base` and `fallback` refer to image clip IDs. PNG resources use single ASCII filenames beside GLB. Static SVG is deliberately deferred until a restricted parser exists; arbitrary SVG animation/scripts are never executed. No package-provided code.

`mappings.expressions` maps existing perform vocabulary to clip IDs; `mappings.activityStates` maps thinking/speaking/listening/idle. Optional `mappings.combinations` maps `expression:activity` to a clip and takes precedence. Otherwise activity wins for full-frame clips, underlying expression survives. Missing mapping falls back to neutral. `flipY` defaults false; optional true explicitly calibrates a source image. Rendering preserves PBR screen material and changes only its cloned color map.

At most 32 clips, 60 frames per sequence, 64 unique resources, 64MiB decoded RGBA (no mipmaps), image dimensions 16..2048. Frame duration 40..10000ms. File ≤12MiB, sidecar ≤256KiB. Paths never contain folders, colon, slash, dot prefix or remote URLs. Asset loader resolves same origin as selected GLB, forbids canonical path escape, and does not combine local model with bundled sidecar.

No new backend event or LLM inference in the initial release. Existing `message_segments.perform` supplies immediate expression. Call-only arbitration keeps WS baseline separate from local sentence performance. Playback metadata keyed by canonical msg_id plus exact normalized say text; sidecar arrival never creates another speech turn. Audio and text presenters have exclusive performance ownership. TTS fallback canonical speech is explicitly whole-message when no trustworthy segments arrive.

Current private assets are prepared in the modeling workspace and not committed to the client repository. Generic example uses placeholders. Optional `.ptchar` `resources.screen` is now installed as `<assetId>.screen.json`; `textures/<name>.png` installs beside GLB. Schema and texture budgets still validate when Room loads the sidecar. Existing file-count/size limits are unchanged; import UI and rollback UI remain pending.
