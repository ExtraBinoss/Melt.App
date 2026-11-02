# Editor tutorial

The editor offers a short optional guided exercise on its first visit. The tutorial
creates and saves a separate `Learning with Melt` project after saving the current
project. It never adds practice assets to the user's current document.

The guide observes real editor commands and export jobs. Its helper buttons perform
the corresponding action; the export step completes only after a successful Motion
export. Each document action uses the engine command boundary and remains undoable.
Closing the tutorial leaves the practice project available. Editor preferences offer
Replay onboarding; dashboard preferences do not.

The browser preference `musart.editor-tutorial.v1` records dismissal or completion.
If browser storage is unavailable, dismissal still works for the current session.
The tutorial copy is intentionally English pending product review. Motion respects
the system reduced-motion preference. A fast text reveal is confined to the guide.
The shared SVG mascot uses opt-in lively idle playback for natural blinking; hidden and reduced-motion instances
stop their animation clock. The first card is centered and the surrounding UI is
dimmed around the active target. Previous reviews completed steps without
repeating their commands. Next performs unfinished actions when needed. Effect
and animation tasks open their actual editor pickers.

## Guided actions

The effect lesson follows three real controls: +, Add effect, then standard Dither.
Menu state and document changes advance the lesson automatically. The effect
search is initialized directly in React state on entry. Shortcut hints use shared Kbd components and the current
OS modifier. Exit confirmation hides the guide so the modal remains reachable.

Next requests are bounded and processed in order. The cursor advances once for
each observed action, even when a manual action and a queued request finish
together. Pending work is cancelled on exit, navigation, replay or Previous.
Editor effects and animation commands are idempotent during the exercise.

Effect menus expose an engine-scoped opening adapter owned by the mounted layer
panel. Its submenu opens after root autofocus finishes. The Motion lesson requests
real canvas pan/zoom toward its control and Next activates the actual Motion radio.
Closed tooltip triggers remain valid spotlight targets. Melt travels from the card
and morphs its own silhouette into a pointer with the same eyes and native engine.

## Practice photographs

The three JPEGs in `apps/web/public/images/tutorial/` are local, compressed copies of
Unsplash photographs. No third-party image requests are needed during the tutorial:

- Mountains: https://images.unsplash.com/photo-1464822759023-fed622ff2c3b
- Lake: https://images.unsplash.com/photo-1470770841072-f978cf4d019e
- Forest: https://images.unsplash.com/photo-1441974231531-c6227db76b6e

The source image identifiers are also retained in the original images.unsplash.com
URLs: `photo-1464822759023-fed622ff2c3b`, `photo-1470770841072-f978cf4d019e`,
and `photo-1441974231531-c6227db76b6e` (640px, quality 75).

During the Dither task, a scoped guide lease holds the effect category open across
hover transitions. Leaving the task releases the lease and closes that surface.
The catalog is initialized with its query before it becomes interactive; no
synthetic input events or timed typing control the search. Card placement uses
the full popup bounds and chooses a free side, above or below it.

After Dither the camera fits the composition, explains Static/Motion at that scale,
and focuses its switch in the next step. It fits again before right-clicking Lake
and choosing Add animation, then Pop. Timeline pinning and its controls follow
animation authoring. The export lesson presents the settings and preview before
exporting the full composition. Cards remeasure their height when moving into
the export dialog, and the mascot faces the highlighted control.
