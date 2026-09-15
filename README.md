[English](README.md) | [简体中文](README.zh-CN.md)

# PresenceKit-desktop

A Tauri + React + TypeScript desktop pet and admin panel client for [PresenceKit](https://github.com/cicikat/PresenceKit) — a companion AI with long-term memory and emotional state.

This client renders the chat window, the desktop pet, and a read-only garden/diary/status panel; it owns no persona, memory, or scheduling data. All of that lives in the backend.

**Requires a running PresenceKit backend** — see the [backend Quickstart](https://github.com/cicikat/PresenceKit#quickstart). This client can't do anything on its own.

A matching [PresenceKit-mobile](https://github.com/cicikat/PresenceKit-mobile) client exists for phones. The two share the same backend, not the same feature set: desktop owns the pet window, sensors, video-call stage, Design Mods, and the native admin bridge.

---

## Download

Prebuilt Windows installers are on this repo's [GitHub Releases](https://github.com/cicikat/PresenceKit-desktop/releases) page. Check the release notes for the compatible [PresenceKit backend](https://github.com/cicikat/PresenceKit/releases) version.

A few things to expect, since the installer isn't code-signed (we don't currently buy a code-signing certificate for this project):

- **Microsoft Edge may block the download outright**, and clicking "Keep" in the download bar doesn't always stick. If that happens, either download with Chrome instead, or follow Microsoft's official steps to keep a blocked download ([Manage warnings about unsafe sites](https://support.microsoft.com/en-us/topic/e0aae59d-a67c-2b90-8006-b3f2b8f232ed)).
- Windows SmartScreen will show an "unrecognized app" warning on first run — click **More info → Run anyway**. This is expected for an unsigned installer, not a sign of anything wrong.
- **Install or extract to a non-system drive** (e.g. `D:\`) if you have one. Running from `C:\` can hit extra permission prompts and Windows Defender scan overhead.
- GitHub Releases also ship a **macOS Universal** `.dmg`. That build is experimental: it is unsigned/unnotarized, has no desktop sensor capture, and still needs a real Mac smoke check. See [docs/release-v0.1.md](docs/release-v0.1.md) for Gatekeeper notes.

---

## Features

The left ribbon is the main map of the app. Preferences (gear) and Help sit at the bottom of that ribbon.

### Chat

- Streaming replies over HTTP send + WebSocket, with history loaded by day.
- Quote a previous user message; stage clipboard images and attachments, preview them, then send or clear.
- Optional bubble opacity, emotion decorations, and persisted inline styles in history.
- Optional per-reply **thoughts** and a separate **Expand thinking** aside (canonical turn reasoning; local display toggle in Character & chat).
- Tool-activity chains and short action narration while the backend is working.
- Group chat, including group-dream invites. Single chat / call streams stay isolated from group and Dream animations.

### Sidebar (read-only unless noted)

- **Pulse** — current activity and a short timeline.
- **Diary** — list and body; open a single entry in its own window.
- **Status** — mood, presence, and related state.
- **Garden** — five plots, growth stage, harvest and vase counts. Watering / harvest actions are not in this client.

### Companion windows

- **Desktop pet** — independent always-on-top transparent window. Particle, 3D, or Live2D stage; mouse dodge / nuzzle / drag; roam and ripple; local window scale. The pet does not open its own WebSocket.
- **Dream** — overlay for sandbox / scenario / mirror / RPG modes, HUD, subconscious (hidden-state) panel, and archive replay. Dream colors, type size, and backgrounds are independent of Reality chat.
- **Do things together** — reading, gomoku, chess, and dream-seed activities, without tearing down the main chat session.
- **Play mode** — optional hardware / toy window (off by default; enable under Pet & interaction).
- **Video call** — 3D or Live2D stage, ambient visuals, and a visual-novel style presenter.
- **Presence popup** — single-instance always-on-top nag window; off by default.

### Preferences

Tabs: General, Interface, Character & chat, Pet & interaction, Advanced.

- Connection URL and desktop token, language, diary sync, and **local screenshot consent** (the backend may request a capture; this client still needs an independent on-device yes).
- Day/night themes, layouts, fonts, chat / Dream color live previews, local HER/YOU avatars, and the current character avatar crop.
- Separate 3D and Live2D model pickers, TTS playback, call, and coplay controls.
- Open the backend **admin panel** from the host menu for model routing, worldbooks, tools, browser tasks, and life-record settings. Those are not edited in this client's preference form.

Model bindings, tool loops, thinking generation, browser-task allowlists, and native life-record capture live in the backend admin (or mobile). This client does not reintroduce those forms.

### Design Mods, themes, layouts

Trusted Design Mods can restyle the in-window shell (bundled example: koke-niwa). Layouts rearrange Ribbon / Sidebar / main pane. Theme mods live under `public/themes/`. Authoring notes: [docs/design-mod-authoring.md](docs/design-mod-authoring.md), [docs/layout-mods.md](docs/layout-mods.md), [docs/ui-mods.md](docs/ui-mods.md).

### Desktop-only sensors

On **Windows**, the Tauri process can capture keyboard / mouse / focused-window signals for the backend. macOS builds record `sensor_not_supported_on_macos` and continue without uploading fake zeros.

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

On Windows, `start-dev.bat` wraps the Tauri dev loop from the repo root.

Import a Live2D model or a room GLB with the guides under [docs/人类说明书/](docs/人类说明书/). Cubism Core (`live2dcubismcore.min.js`) is proprietary and is **not** in git.

---

## Docs

| Doc | Content |
|---|---|
| [AGENTS.md](AGENTS.md) | Working entry point for AI collaborators |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current architecture overview |
| [docs/backend-integration.md](docs/backend-integration.md) | Backend HTTP, WebSocket, and Tauri IPC details |
| [docs/frontend-structure.md](docs/frontend-structure.md) | React window/component/state guide |
| [docs/testing.md](docs/testing.md) | Automated tests, CI scope, and release smoke boundaries |
| [docs/design-constraints.md](docs/design-constraints.md) | Cross-pipeline and transport constraints |
| [docs/pet-window-reference.md](docs/pet-window-reference.md) | Desktop pet window behavior |
| [docs/known-issues.md](docs/known-issues.md) | Bugs, risks, and technical debt |

---

## License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

Noncommercial use is permitted. Commercial use is not permitted without separate permission from the author.
