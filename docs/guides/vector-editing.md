# Editing SVG points

Select an SVG layer, then choose **SVG → Edit points** in Properties. Select a
path and contour when the artwork contains several. Drag anchors or their
incoming/outgoing Bézier handles; choose Corner, Smooth or Symmetric to control
their relationship. Arrow keys move the selected point, and Shift increases the
step to ten units. Zoom in around the selected point or use Fit to see the path.

Split next segment preserves the curve exactly. Delete point retains at least
three points in closed contours or two in open paths. Straight corners have an
editable radius; their original anchors and radius settings survive saving,
reopening and undo. Line ends and joins are configured per SVG path. Closing a
contour and its fill/stroke semantics use the ordinary portable vector model.

Each completed gesture is one undoable engine command. Escape cancels an active
drag without closing the dialog. Closing the dialog, changing the authoritative
layer or losing the pointer cancels an unfinished preview. Locked layers and
outlines driven by an authored Morph effect cannot be edited; remove that effect
before changing its source points.

The pure TypeScript geometry helpers in `packages/core/src/vector/edit/` use the
MIT-licensed SVGPathData parser to normalize SVG commands and affine transforms
into editable cubic contours. Node editing is bounded to 4,096 commands per path.
Rounding metadata is validated against its baked ordinary SVG outline; renderers
and older consumers can continue reading the outline without editor state.

The lazy UI maintains gesture drafts outside React's canonical document state,
coalesces preview writes and updates SVG handles imperatively. The main canvas
continues using the normal GPU preview port. The native regression
`test/browser/vector-editor.spec.ts` verifies actual pointer input, cancellation,
stale-source protection, one-step undo, persistent radii, save/reload, zero
production pixel readbacks and unchanged editor React counters during a drag.
GPU acknowledgement and animation-frame observations in its ignored artifact
are functional diagnostics, not physical display latency measurements.
