[English](README.md) | [简体中文](README.zh-CN.md)

# PresenceKit-desktop

A Tauri + React + TypeScript desktop pet and admin panel client for [PresenceKit](https://github.com/cicikat/PresenceKit) — a companion AI with long-term memory and emotional state.

This client renders the chat window, the desktop pet, and a read-only garden/diary/status panel; it owns no persona, memory, or scheduling data. All of that lives in the backend.

**Requires a running PresenceKit backend** — see the [backend Quickstart](https://github.com/cicikat/PresenceKit#quickstart). This client can't do anything on its own.

---

## Download

Prebuilt Windows installers are on this repo's [GitHub Releases](https://github.com/cicikat/PresenceKit-desktop/releases) page. Check the release notes for the compatible [PresenceKit backend](https://github.com/cicikat/PresenceKit/releases) version.

A few things to expect, since the installer isn't code-signed (we don't currently buy a code-signing certificate for this project):

- **Microsoft Edge may block the download outright**, and clicking "Keep" in the download bar doesn't always stick. If that happens, either download with Chrome instead, or follow Microsoft's official steps to keep a blocked download ([Manage warnings about unsafe sites](https://support.microsoft.com/en-us/topic/e0aae59d-a67c-2b90-8006-b3f2b8f232ed)).
- Windows SmartScreen will show an "unrecognized app" warning on first run — click **More info → Run anyway**. This is expected for an unsigned installer, not a sign of anything wrong.
- **Install or extract to a non-system drive** (e.g. `D:\`) if you have one. Running from `C:\` can hit extra permission prompts and Windows Defender scan overhead.

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
