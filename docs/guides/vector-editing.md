# Editing SVG points on the canvas

Selecting an editable SVG keeps the ordinary move, resize and rotation handles.
Choose the floating **Edit points** action just above the selected object, the same action in Properties, or
double-click the SVG to enter point editing directly on the artwork. Other layer
types, locked/hidden layers, mask sources and authored Morph outlines do not
expose this canvas action. The entry pops in/out, follows the viewport imperatively, and stays clear of the rotation grip; when the upper edge is clipped it moves beneath the object.

Drag anchors or incoming/outgoing Bézier handles on the main canvas. The floating
bar switches Corner, Smooth and Symmetric nodes. Its settings popover contains
path/contour selection, point coordinates, corner radii, segment splitting,
deletion, contour closure, line ends and joins. The normal viewport controls and
trackpad continue to pan and zoom the artwork. There is no separate SVG dialog
or second rendered copy of the artwork.

Points and strokes use screen coordinates, including viewBox offsets, nested
rotation and nonuniform scale. Their size does not grow with canvas zoom. Dense
anchors are visually spaced at overview zoom; no document points are removed or
simplified. The selected point is always exposed, keyboard focus reveals any
hidden decoration, and zooming in exposes the remaining source anchors.

Stroke contrast follows the dominant declared SVG paint, estimated from path
bounds and opacity weights. A black/white halo preserves boundaries across
contrasting details. This uses document geometry and colors, never GPU pixel
readbacks. It is not a histogram of composited effects or transparent artwork.

Each completed gesture is one validated, undoable document command. Escape first
cancels an unfinished drag, then exits point editing; Done returns keyboard focus
to the canvas. Closing settings leaves point mode active. A changed canonical
origin, playback, a changed viewport during a drag, pointer cancellation or window
blur restores the preceding geometry and cancels queued previews. Selection and
project changes dispose the old editing surface. Portaled settings menus keep
pointer/keyboard ownership rather than selecting the canvas behind them.

Arrow keys move the selected point; Shift increases the step to ten units. Split
next segment preserves the curve exactly. Closed contours retain at least three
points, open paths at least two. Radius metadata retains original anchors through
save/reopen/undo. The pure TypeScript helpers in `packages/core/src/vector/edit/`
use the MIT-licensed SVGPathData parser and bound editing to 4,096 commands per
path. Morph-driven outlines require removing the authored effect before editing
the source points.

`test/browser/vector-editor.spec.ts` checks native previews, one-step undo,
cancellation, stale origins, node styles, persistent radii and real save/reload.
`test/browser/canvas-inline-controls.spec.ts` uses the actual Melt Mascot template,
checks double-click entry and ordinary handles, verifies a GPU node preview with
unchanged editor React counters, inspects contrast and point sizes, and exercises
upright dimensions plus shared mode controls. Arabic canvas/settings focus is
covered by `test/browser/canvas-artboard-controls.spec.ts`. Captures and raw RAF
opportunities remain under ignored `artifacts/`; they are functional diagnostics,
not physical display latency or a percentile performance benchmark.
