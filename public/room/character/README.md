Character `.glb` models go here (e.g. `character.glb`, `full.glb`).

These are large binary assets and aren't distributed with this repo — bring your own
(see `docs/`). This file exists only so the directory survives a fresh `git clone`;
without it, `tauri build`'s resource bundling (`../public/room/` in `tauri.conf.json`)
fails because the path doesn't exist. If no model is present at runtime, the app falls
back to a placeholder capsule shape (see `src/shared/room3d/useCharacterRig.ts`).
