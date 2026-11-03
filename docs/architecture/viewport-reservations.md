# Motion panel reservations and canvas framing

The unpinned timeline overlays the workspace. Pinning reserves its final height
once; it does not animate a flex height or scale the workspace and Properties
panel on every frame.

Artboards, headings and their mode controls are positioned relative to the
viewport's center. Changing the viewport height therefore changes their screen
position even when the view's pan and zoom have not changed. Scaling the entire
workspace to conceal that change also distorts the artwork and control geometry.

| Owner                | Responsibility                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `viewport-resize`    | An engine-scoped imperative port connects the mounted canvas to an explicit layout reservation. Registration tokens prevent stale cleanup from removing a newer owner. |
| `resize-anchor`      | Captures the old viewport center and current view before the reservation. After layout, reads the new rectangle once and compensates pan by `oldCenter - newCenter`.   |
| `ViewMotion.reframe` | Presents the rebased view before paint without clamping its initial screen pose. The view source, picking, selection and rulers keep using the same coordinates.       |
| `MotionTimelineDock` | Captures before Pin/Unpin, applies after layout and preserves the existing body/grip transition ownership. It never applies `scaleY` to the workspace.                 |

If the rebased pose remains within the new pan bounds, the artwork retains its
exact screen position and zoom. If a very large panel or an existing edge pan
places it outside those bounds, a critically damped, position-only spring brings
it into reach. The first frame still presents the old screen pose; intermediate
frames do not snap to the final constraint.

The position driver publishes imperative view updates. React receives one
settled pose, with no repeated outer editor commits during the correction.
The shared spring also drives the timeline body; neither path changes zoom,
stretches controls or reads GPU pixels.

| Interruption                      | Behavior                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapid Pin/Unpin                   | Retires the earlier lease and captures the currently presented pose. Late callbacks cannot affect the replacement.                                        |
| Pointer, wheel or viewport action | Cancels the reservation's correction before the normal input handler runs.                                                                                |
| ResizeObserver                    | Absorbs only the notification matching an active constrained correction. An unrelated viewport resize cancels it and retains ordinary resize constraints. |
| Project/layout change or unmount  | Unregisters the adapter and stops its owned driver.                                                                                                       |
| Reduced motion                    | Applies the valid final pose immediately.                                                                                                                 |

Ordinary window resizing, Fit, Reset, Recenter and wheel zoom keep their existing
behavior. The framing bridge is requested only by explicit Pin/Unpin transitions.
The focused native witness records artwork/selection rectangles, zoom and editor
commit counters on actual animation frames; final panel height alone does not
establish visual continuity.

## Static/Motion presence and page switches

A persistent `DockViewportReservation` captures the old viewport during React's
pre-mutation snapshot lifecycle when the composition scope or mode changes. It
applies the lease after descendant layout effects have measured the final slot.
The 32-pixel peek overlays the workspace and reserves no height, so it cannot
resize the canvas, toolbar or sidebar. Switching between unpinned compositions
also skips viewport/panel reservation geometry reads entirely. Restored pinned heights and disappearance
reserve their final layout once, without animating flex height or scaling artwork. The body slides in independently;
the most recent Motion dock leaves layout immediately, becomes inert and
aria-hidden, and fades/slides over the app. Its controls remain mounted while a
Static composition is active, so returning to that Motion composition reuses
them. Only one composition scope is retained; switching to another Motion scope
or project releases its observers and gesture state. Reduced motion removes the
visual transition.

Applying a resize lease uses the currently rebased view, composing its viewport
center delta with a structural artboard-origin change in the same commit. The
registered adapter remains stable across layout keys; canonical scope checks and
native input still retire stale corrections. Initial project opening keeps its
normal Fit behavior.

The panel ResizeObserver does not write a peek transform while a slide owns that
transform. It publishes a height only when the measured value changes; later
pinned-height changes capture/apply their own viewport lease. Hidden ruler
subscriptions are suspended. Shared segmented indicators and virtual lists use
initial ResizeObserver delivery rather than synchronously forcing layout during
mount, keeping geometry reads out of repeated control layout effects.

For pinned reservations, sidebar panels, their separator and the toolbar retain
their old screen positions through a local native translation animation. Geometry
reads precede animation writes; interruption and unmount cancel the owned lease.
The timeline starts its native body slide after the mounting commit, keeping a
long mount from consuming its entrance before the first paint opportunity.

## Deliberate peek entry

The unpinned 32-pixel peek never expands solely because a pointer rests on it.
Entry follows the same geometric intent rule over the ruler and transport controls;
there are no button-specific exceptions. Moving sideways or aiming at the middle
of the strip leaves the live controls in place. Crossing at least 20 pixels into
the strip, or continuing a quick downward push from inside it, arms the existing
100 ms entrance delay. A quick approach from outside alone does not arm it.
Retreating into the shallow edge or leaving cancels the pending entrance.

Pointer presses clear pending entry intent; release does not reopen it without a
new deliberate movement. Touch taps and ruler scrubs retain their ordinary input
ownership. Explicit toggles and native drag entry can still open the panel. Open
panel exit grace, the handle corridor, owned portals, keyboard focus and pinning
retain their existing behavior. Cached geometry is measured on entry/layout only;
movement sampling and admission stay imperative without per-move layout reads or
React state updates.

## Layer-list clearance below the unpinned transport

The 32-pixel transport strip overlays the sidebar as well as the canvas. Only the
Layers panel reserves that hidden strip internally, so its native tree viewport,
scroll extent, selection reveal and scroll shadows end above the transport. The
Properties panel, sidebar splitter and canvas keep their existing geometry. A
pinned timeline already reserves workspace height and gets no extra clearance;
Static mode and an outgoing dock also clear the internal reservation.
