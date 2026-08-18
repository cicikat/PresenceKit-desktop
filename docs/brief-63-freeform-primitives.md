# Brief 63: Freeform primitives and edge ornaments

`DesignModHost` API v2 separates a sidebar capability into an explicit author
choice: `official-renderer`, `subregions`, or `presenter-only`. Parent and child
attachments still conflict, while different child primitives can be placed in
independent layers. New semantic renderer primitives are Status
`mood/activity/timeline`, Flow `now/timeline`, Garden `visual/summary/controls`,
and Diary `identity/entries`.

`chat.sidebar.diary.characters` is retained only for schema-v2 installed-Mod
compatibility. New mods must use `chat.sidebar.diary.identity`; it represents
the active character and does not expose preference-level character management.

`host.scene.create()` gives a node a stable id, source primitive, layer, anchor,
size constraints, transform channels, pointer mode and disposer. It uses one
on-demand scene scheduler, never a per-node permanent animation loop.
`host.edges.get/observeEdge()` supplies versioned page/component rectangles,
directed edges, normals, corners, visibility and DPR. Hidden or covered host
state pauses edge delivery; `OrnamentGrowth` is session-local and capped.

The `freeform-capability-fixture` declares Flow/Garden/Diary `subregions` and
Status `subregions`, places all nine official child subregions as scene nodes,
and uses one bounded canvas for page and Flow-edge ornaments. Status
`presenter-only` remains the no-attachment mode: a Mod must draw all Status
content from `host.presenters.status` rather than copying official DOM. It is an
API fixture, not product art.

No backend setting, mobile setting, HTTP route, Tauri command, WS message,
queue, trace, or cross-repository interface was added. Real Windows visual,
DPI, multi-monitor, and 20-switch acceptance remains `partial/open`.
