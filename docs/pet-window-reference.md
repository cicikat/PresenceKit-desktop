# pet-window-reference.md - desktop companion UI reference

This document extracts the useful design intent from the old
`pet.jsx` and `spec.jsx` in the `Emerald-desktopUI` repo (usually a sibling
of this repo).
It remains a tuning reference for the implemented PresenceKit-desktop pet window;
it is not a requirement to preserve the old JSX implementation or file structure.

## Current status

The pet window is implemented in `src/windows/pet/` as a transparent/topmost Tauri window with particle, 3D, and Live2D stages. It receives state and speaking events from the main window, supports mouse-aware retreat/nuzzle/drag behavior, and does not open its own WebSocket. The richer concrete behavior loop described below remains post-v0.1 reference material.
Relevant new-client entry points:

- `src/windows/chat/ChatWindow.tsx`
- `src/shared/state/store.ts`
- `src/windows/chat/components/Ribbon.tsx`
- `src/windows/chat/components/ChatPanel.tsx`
- `src/windows/chat/components/SubFlow.tsx`
- `src/windows/chat/components/SubStatus.tsx`
- `src/shared/theme/globals.css`
- `src-tauri/tauri.conf.json`

## Core principle

The pet is state-driven, not message-driven. The user should be able to feel
that the companion is present even when no chat bubble appears.

The durable state model is:

- `mood`: long-lived emotional tone.
- `focus`: short-lived attention target or posture.
- `presence`: active, idle, or away availability.
- `mode`: `companion` or `chat-only`.
- `wantToSpeak`: a transient signal that something almost became a message.

Messages are only one expression of this state. The pet window should also
express state through breathing, gaze, posture, aura, delay, and small failed
or incomplete behaviors.

## Design principles from `spec.jsx`

### 1. State Before Message

Mood and focus must be continuously visible through ambient signals. Avoid
making mood only a tag, icon, or line of text. The pet should communicate mood
before it says anything.

Examples of continuous signals:

- Breathing rhythm and depth.
- Gaze lock strength.
- Blink interval and irregularity.
- Aura hue and intensity.
- Body tilt and micro drift.
- Reaction delay.

### 2. Permanent Micro Motion

A perfectly still pet feels dead. Even when idle, the pet needs subtle motion:

- Breathing.
- Tiny position drift.
- Eye movement.
- Occasional blink.
- Slight changes in posture.

The old spec treated stillness longer than roughly 800ms as a failure for the
companion illusion. The new implementation does not need to copy that exact
number, but it should preserve the principle.

### 3. Delay Creates Personality

Not every reaction should be instant. Delay is part of character expression:

- Low mood can react more slowly.
- Distracted mood can have a delayed or indirect gaze response.
- Hesitation before moving toward the cursor matters more than the movement
  itself.

This should be implemented intentionally, not as accidental UI lag.

### 4. Failure Is Valuable

Some behaviors should fail or remain incomplete. The old prototype used a
40 percent failure chance for mouse-nudge behavior. The exact probability can
change, but the design intent should remain:

- Sometimes the pet starts moving toward the user and gives up.
- Sometimes it wants to say something, then does not.
- Sometimes it looks away before fully engaging.

A pet that always completes every action feels like a button. A pet that
sometimes fails feels more alive.

### 5. Asymmetric Attention

The pet should not always stare directly at the cursor. Attention should vary:

- Direct gaze when focused on the user.
- Wandering gaze when distracted.
- Downward gaze when thinking.
- Sidebar/chat/screen-oriented gaze when reacting to UI context.
- Occasional glance behavior that is short and easy to miss.

This is especially important if Dream UI adds softer, more ambiguous states.

## Behavior model from `pet.jsx`

The old pet implementation had useful behavior categories, even though the SVG
placeholder character should not be treated as final art.

### Visual inputs

The pet visual responded to:

- Current mood.
- Current focus/activity.
- Presence state.
- Mouse position.
- Chat panel bounds.
- Sidebar bounds.
- `wantToSpeak`.

For the new client, equivalent inputs should come from:

- `StateEngine` in `src/shared/state/store.ts`.
- Chat and sidebar geometry from `ChatWindow.tsx`.
- Backend mood/activity/sensor state from existing API wrappers.
- Future backend `state_update` events over WebSocket.

### Continuous animation

The old pet used `requestAnimationFrame` for:

- Breathing scale.
- Body tilt interpolation.
- Eye offset interpolation.
- Blink timing.
- Aura hue/intensity interpolation.
- Micro drift.
- Nudge movement.

Future implementation should keep animation local to the pet surface, while
keeping business state outside the pet renderer.

### Mouse nudge

The nudge behavior had four phases:

1. Hesitate: small pause before moving.
2. Going: move partly toward the cursor.
3. Hold: brief stay near the cursor, only on success.
4. Retreat: return toward a nearby home position.

Important details:

- Trigger only when the cursor is near enough.
- Use mood-dependent trigger rates.
- Include a failure path.
- Do not return to the exact same pixel; slight imprecision helps.

### Click reaction

Clicking the pet should not feel like pressing a normal button. The old
prototype treated click as a small startle or shyness event:

- Mark user interaction.
- Cancel current nudge.
- Move slightly away.
- Return focus toward the user after a short delay.

If future UI needs a pet menu, prefer long press, context menu, or a secondary
control. A normal click should remain expressive first.

### Want-to-speak signal

`wantToSpeak` should be visible without necessarily sending a message.

The old prototype used a small "UNSENT" envelope above the pet. The exact visual
can change, but the semantics are useful:

- The companion almost said something.
- The signal is temporary.
- It should create tension without forcing a chat bubble.

The chat panel already has a related typing flash path in
`src/windows/chat/components/ChatPanel.tsx`; the current pet window can consume the
same state signal.

## Mood and focus mapping

The old mapping is still useful as tuning reference. The new `StateEngine`
already preserves the main tables in `src/shared/state/store.ts`.

Mood should influence:

- Breath period and depth.
- Blink interval and jitter.
- Eye follow strength and damping.
- Micro drift.
- Aura hue and intensity.
- Reaction delay.
- Lid droop or visible tiredness.

Focus should influence:

- Gaze target: cursor, chat panel, sidebar, screen edge, down, or idle drift.
- Body tilt.
- Extra lid closure.
- Optional particles, such as thought or glance.
- Optional duration before returning to default focus.

Presence should influence:

- Opacity.
- Scale.
- Whether behavior is allowed.
- Whether proactive signaling is allowed.
- Position strategy, such as free movement versus parked corner.

## Companion Mode vs Chat-Only Mode

The old spec separated two modes:

- `companion`: pet visible, behavior loop active, ambient state fully expressed.
- `chat-only`: pet hidden or faded out, proactive behavior disabled, chat remains
  the primary tool.

The new client already has a `petVisible` ribbon toggle and calls
`engine.setMode("companion" | "chat-only")` in `ChatWindow.tsx`. Future work
should attach real pet-window behavior to that existing mode instead of adding
an unrelated switch.

## Dream UI implications

Dream UI should build on the new client, not the old prototype.

Recommended shape:

- Start as a chat mode plus theme overlay.
- Use `data-theme` tokens in `src/shared/theme/globals.css`.
- Add any dream-specific state to `StateEngine` only if it affects multiple
  surfaces.
- Reuse `ChatPanel`, `PaneHost`, `SubDiary`, and theme infrastructure.

Avoid starting Dream UI as a separate window unless it specifically needs
independent transparency, always-on-top behavior, or separate lifecycle control.
The current app has no router and only one Tauri window, so a new route/window
would add structural work before the Dream experience is proven.

Most likely Dream UI touch points:

- `src/shared/theme/globals.css`: add `data-theme="dream"` or overlay tokens.
- `src/windows/chat/ChatWindow.tsx`: add mode/theme state and pass it downward.
- `src/windows/chat/components/Ribbon.tsx`: expose a Dream entry if needed.
- `src/windows/chat/components/ChatPanel.tsx`: adjust message atmosphere,
  header, and input presentation for Dream mode.
- `src/shared/state/store.ts`: add dream-specific state only if it is shared
  across chat, sidebar, and pet.
- `src/windows/chat/components/SubDiary.tsx`: Dream-related diary filtering may
  reuse existing emotion/category UI.

Old files are only needed as reference for:

- `pet.jsx`: behavior timing, mouse-aware reactions, and pet presence details.
- `spec.jsx`: design principles for aliveness, delay, failure, and asymmetric
  attention.

Old files are not needed for:

- Main layout.
- Chat rendering.
- Sidebar structure.
- Garden rendering.
- Diary panes.
- Theme token names.
- Floating pane mechanics.

## Deletion note

After this document exists, deleting the `Emerald-desktopUI` repo would no longer
lose the high-level pet-window design principles. Deletion should still wait
until the project explicitly decides whether the desktop pet is:

- Still planned, in which case this document becomes the implementation guide.
- Abandoned, in which case docs that mention an unimplemented pet window should
  be updated to say it is intentionally deferred or removed.
