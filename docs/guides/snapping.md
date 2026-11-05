# Smart snapping

## Candidate scope

| Rule              | Contract                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation    | `packages/core/src/layout/snapping` is the pure geometry implementation.                                                                                                                              |
| Captured input    | `SnapIndex` captures a composition and the moving root IDs once per gesture.                                                                                                                          |
| Targets           | It indexes visible layer/group bounding-box edges and centers, artboard edges and centers, page safe-area margins, and manual page/layer guides that are horizontal or vertical in world coordinates. |
| Exclusions        | A moving group's descendants, attached mask sources, hidden subtrees and zero-opacity subtrees cannot attract that gesture.                                                                           |
| Locked references | Locked visible objects remain legitimate references.                                                                                                                                                  |

## Index and tie-breaking

| Rule           | Contract                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query input    | Queries take a world-space bounding box and a document-unit tolerance.                                                                             |
| Indices        | Each axis uses sorted coordinate buckets and a second perpendicular index.                                                                         |
| Tie order      | Equal-distance ties prefer manual guides, margins, layers, then the artboard, followed by perpendicular proximity and a stable ID.                 |
| Moving anchors | This same rule applies across the moving object's three anchors.                                                                                   |
| Bounded search | Queries inspect at most 24 target candidates; construction is one indexed walk plus sorting, rather than an all-layer scan on every pointer event. |
| Transforms     | Group transforms are resolved through the shared geometry index.                                                                                   |

## Transform behavior

| Rule         | Contract                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Index owner  | `TransformSnapping` owns the lazy index for a move/resize session.                                                                                                |
| Move         | Collective movement uses the selected roots' union, then maps the corrected world displacement back through each parent's inverse matrix.                         |
| Resize       | Resizing snaps the actual transformed moving corner, fixes the opposite corner, and checks the achieved point after aspect constraints and minimum-size clamping. |
| Cue validity | It never displays a cue for a constraint the final geometry cannot satisfy.                                                                                       |
| Rotate       | Rotation retains the existing optional 15-degree constraint.                                                                                                      |

## Preferences and interaction

| Rule               | Contract                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage scope      | `state/snapping/preferences.ts` stores a versioned, small user setting independently of documents and history.                                                                                                    |
| Defaults           | Snapping defaults to enabled with a six-CSS-pixel attraction distance; supported values are 1–24 pixels.                                                                                                          |
| Zoom               | The gesture converts that distance to document units using the current zoom.                                                                                                                                      |
| Numerical boundary | Inclusive comparisons allow one relative float32 epsilon for CSS-transform round trips; this numerical allowance is below one millionth of a CSS pixel at the default setting, not an additional attraction zone. |
| Settings access    | Cmd/Ctrl+K and Editor preferences update this same source.                                                                                                                                                        |
| Playground         | The preferences playground calls the real `SnapIndex` without changing a project.                                                                                                                                 |

Holding Alt/Option temporarily bypasses attraction. Modifier changes refresh the current preview without requiring a pointer move; the release point/modifiers receive a final guard without recalculating an unchanged gesture. These conventions follow the official [Affinity snapping documentation](https://affinity.help/designer2/en-US.lproj/pages/DesignAids/snapping.html), including its screen-distance tolerance and temporary Alt override.

### Preview and commit

| Rule                  | Contract                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Imperative preview    | The gesture publishes layer patches and `SnapFeedback` imperatively.                                                        |
| React boundary        | App, Inspector, CanvasArea, EditorCanvas and EditorScene do not receive per-pointer React state.                            |
| Complete or cancel    | Completion sends one validated bulk patch command; cancellation discards patches and cues.                                  |
| Stale origins         | Stale project/page/revision origins are rejected before preview or commit.                                                  |
| Cue subscription      | `Measurements` subscribes to feedback and the current view.                                                                 |
| Visible cues          | It draws only engaged alignment lines and genuine perpendicular gap arrows, with constant screen stroke and text sizing.    |
| Idle annotations      | Idle padding/distance annotations are hidden.                                                                               |
| Manual guides         | Editable manual guides and rulers remain separate.                                                                          |
| Ownership and cleanup | Preview feedback has no storage, GPU readback or history effect; scene/playback/scope changes clear or suppress stale cues. |

## Verification

Exact mirrors cover candidate filtering, transformed guides, deterministic priority ties, ten-thousand-object bounded comparisons, collective/nested transforms, constrained resize, idle overlay suppression, modifier changes, stale origin cancellation and one undo entry. `test/browser/snapping.spec.ts` drives the actual canvas at 100% and 200%, verifies the six-pixel boundary, Alt and persisted command-search toggles, resizes to a manual guide, captures engaged cues, checks editor React counters during preview, and instruments actual GPU/Canvas read APIs.

Run these checks through the repository's bounded, single-process verification coordinator. Constructor time and first-drag latency must be reported separately from bounded query comparisons; no unit wall-time assertion is a substitute for a native load cohort.

## Native 3D translation

`SpatialSnapIndex` extends the shared sorted coordinate indices to three axes. It
captures moving bounds and reference bounds once per gesture. The native adapter
uses already prepared CPU mesh bounds, falling back to portable source geometry;
it does not prepare meshes, read pixels or traverse vertices on each pointer move.
Moving descendants, ancestors containing the moving selection, hidden and
zero-opacity subtrees and mask sources are excluded. Locked visible objects remain
references. Composition bounds and its origin supply page-center constraints.

The native translation gizmo supplies its active world axis or plane. Corrections
are solved there, then mapped through the inherited inverse matrix into the
object's authored local position. The free center handle solves two constraints
inside its camera-facing drag plane, rather than snapping depth independently.
Parent transforms, affine bases and group pivots
remain intact. This aligns real world coordinates, rather than silently changing
depth merely to make two projected objects overlap.

Attraction uses the shared pixel threshold (six CSS pixels by default), measured
through the actual display camera, including perspective, zoom and Studio's camera
window. View-parallel and behind-camera constraints do not attract. An engaged
constraint holds until 1.6 times the attraction radius, avoiding flicker between
nearby targets. Alt clears both correction and feedback immediately; releasing it
re-evaluates the last raw pose without requiring a pointer move.

Feedback is transient data in an engine-scoped Jotai atom. The bounded SVG guide
surface subscribes imperatively, outside App, Inspector and scene React renders.
Only engaged constraints are drawn, with constant CSS-pixel strokes and endpoint
markers. Pointer completion commits through the existing validated spatial/Motion
transaction; Escape, blur, pointer cancellation, owner changes and teardown discard
the draft and guides. No preview creates document keys or history entries.

Native rotation and scale retain their existing optional Shift increments.
