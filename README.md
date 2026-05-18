# Emerald-client

Tauri + React + TypeScript desktop client for the `qq-st-bot` AI companion system.

This repo is the new client being migrated from the old desktop projects. Core memory, prompt, scheduler, tools, and character data live in `D:\ai\qq-st-bot\`; this repo owns the desktop UI, local Tauri IPC bridge, WebSocket client, and future pet window.

## Start

```bash
npm run dev
npm run tauri dev
npm run tauri build
```

Vite runs on `http://localhost:1420`.

## Docs

- `AGENTS.md` — working entry for AI collaborators.
- `ARCHITECTURE.md` — current architecture overview.
- `docs/backend-integration.md` — backend HTTP, WS, and Tauri IPC details.
- `docs/frontend-structure.md` — React window/component/state guide.
- `docs/migration-status.md` — migration map from old desktop projects.
- `docs/known-issues.md` — bugs, risks, and technical debt.
