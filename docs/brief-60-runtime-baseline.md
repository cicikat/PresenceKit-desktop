# Runtime performance baseline: work order 60

Status: partial/open. This file records the local instrumentation and the
required real-window capture format. No backend business payload is collected.

The runtime diagnostics API is disabled by default and can be enabled by the
desktop diagnostics owner with `runtimeDiagnostics.setEnabled(true)`. It keeps
one-second frame/long-task windows, command aggregates, JS heap usage when the
browser exposes it, and native satellite sample/send/drop/payload counters.
Satellite sampling is budgeted at 20 Hz in the foreground and stops while the
surface is hidden or paused.

| Scene | Build | Root PID | Snapshot samples/s | Sent/s | Dropped | Frame avg/p95 | Peak private bytes | Status |
|---|---|---:|---:|---:|---:|---|---:|---|
| builtin-default, idle | debug/release |  | 0 | 0 | 0 |  |  | open |
| v1 Design Mod, idle | debug/release |  |  |  |  |  |  | open |
| native fixture, 3 surfaces | debug/release |  | <=20 |  |  |  |  | open |
| hidden/minimized/covered | debug/release |  | 0 | 0 |  |  |  | open |
| 20 Mod/window toggles | debug/release |  |  |  |  |  |  | open |

Windows debug observation on 2026-08-17: the native fixture created three owned
surfaces at 175% DPI; move/resize preserved halo margin and island anchors, and
minimize/restore/close synchronized visibility and disposal. Runtime diagnostics
were not exposed in a test UI in this session, so no frame p95, click-to-ack,
private-byte, payload-rate, or 20-toggle numbers were recorded. Those cells
remain open rather than inferred from window handles.

Real Windows debug fixture and release `resource_dir` captures remain required
for closure, including 100/125% DPI, negative monitor coordinates, Alt-Tab,
main-window close, and process-level private-byte recovery.
