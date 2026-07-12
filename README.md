[English](README.md) | [简体中文](README.zh-CN.md)

# PresenceKit-desktop

A Tauri + React + TypeScript desktop pet and admin panel client for [PresenceKit](https://github.com/cicikat/PresenceKit) — a companion AI with long-term memory and emotional state.

This client renders the chat window, the desktop pet, and a read-only garden/diary/status panel; it owns no persona, memory, or scheduling data. All of that lives in the backend.

**Requires a running PresenceKit backend** — see the [backend Quickstart](https://github.com/cicikat/PresenceKit#quickstart). This client can't do anything on its own.

---

## Connecting to a backend

By default the client expects a backend at `http://127.0.0.1:8080` on the same machine. To point it elsewhere or set your device token:

- **Recommended**: open the app → Preferences → Connection Settings, and fill in the backend URL and token from inside the UI. No file editing required.
- **Advanced / headless**: copy `config/client.example.json` to `config/client.local.json` and edit `backendBase`, `websocketBase`, and `adminToken` directly.

See [docs/backend-integration.md](docs/backend-integration.md) for the full HTTP/WS/Tauri-IPC contract, and the backend's [docs/token-rotation.md](https://github.com/cicikat/PresenceKit/blob/main/docs/token-rotation.md) for how to issue a desktop-scoped token.

---

## Development

```bash
npm install
npm run dev          # Vite dev server only, http://localhost:1420
npm run tauri dev     # full Tauri dev shell
npm run tauri build   # production build
```

---

## Docs

| Doc | Content |
|---|---|
| [AGENTS.md](AGENTS.md) | Working entry point for AI collaborators |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current architecture overview |
| [docs/backend-integration.md](docs/backend-integration.md) | Backend HTTP, WebSocket, and Tauri IPC details |
| [docs/frontend-structure.md](docs/frontend-structure.md) | React window/component/state guide |
| [docs/design-constraints.md](docs/design-constraints.md) | Cross-pipeline and transport constraints |
| [docs/known-issues.md](docs/known-issues.md) | Bugs, risks, and technical debt |

---

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted. Commercial use is not permitted without separate permission from the author.
