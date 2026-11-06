# Selecting overlapping artwork

Use the pointer tool in Classic or Studio. A normal primary click selects the
foremost unlocked artwork at the pointer. Empty parts of a prepared image, vector
holes, empty groups, transparent shape fills and rounded corners allow the click
to reach artwork below. A locked group also excludes its descendants from normal
canvas selection; Layers and the explicit context picker still expose them.

Hold **Ctrl+Shift** on Windows/Linux or **Cmd+Shift** on macOS and primary-click to
cycle the overlap stack. Each repeated click advances from the current selection.
A group appears immediately after its foremost hit descendant. Ctrl/Cmd alone
continues to toggle a layer in the current selection. Alt keeps its existing drag
behavior. The overlap shortcut does not create a move gesture or history entry.

Right-click without dragging to open the canvas context menu, then open **Select
layer**. Hover or keyboard-focus a candidate to see its outline and name. Activate
it with a primary click or Enter. Locked candidates show a lock icon and remain
protected from canvas transforms. Escape closes the submenu/menu and restores
canvas focus. This menu is nonmodal: it must not lock the page body or change
unrelated surface styles. A right-button drag retains the workspace’s existing marquee/navigation behavior.

Selecting a lower layer through Layers or the context picker retains that target
when starting a drag over its actual artwork, even if opaque artwork covers it.
A stationary ordinary click still resolves to the visible foreground. Escape
cancels a drag, and a completed move creates one undoable edit.

## Coverage and limits

Image coverage is prepared from immutable originals in a dedicated worker using
native image decoding, independently of the compositor. Pointer handlers read
retained alpha bytes synchronously; they do not download, decode or read GPU
pixels. Vector paths use native geometric fill/stroke tests, including even-odd
holes and part transforms. Shape paint, ancestor transforms, visibility, locks,
mask-source exclusion and group clipping participate in picking.

The source cache admits up to 64 unique image originals, at most 16,777,216 pixels
per original and 33,554,432 retained alpha bytes in total. One decoder job runs at
a time. Unsupported, oversized, preparing, failed or timed-out sources retain a
geometry fallback. Removed sources cancel pending work, stale worker replies are
ignored, and closing the canvas terminates its worker and clears retained bytes.
These bounds prevent an overlap action from starting an unbounded decoder queue.

Original alpha is not a promise of final GPU coverage. Text, animated/video
frames, masks and arbitrary effects retain their existing geometry behavior;
morph effects deliberately use their prepared geometry bounds. Use the explicit
picker or Layers when a treatment changes the visible silhouette. The context
submenu shows the first 64 candidates; cycling can reach the rest of the unlocked
stack. Locked candidates are available through the submenu and Layers.

## Focused verification

The native scenario is `test/browser/overlap-selection.spec.ts`. It exercises both
workspaces with real primary/modifier/secondary input, a transformed image with a
transparent half, an even-odd vector hole, inherited locks, candidate hover and
keyboard focus, body-style preservation, stable covered-layer dragging,
Undo/Redo and cancellation. It records native input capture to useful selection
DOM and a subsequent animation frame; this is a browser presentation opportunity,
not a physical display or INP measurement. It also probes actual main-thread GPU,
WebGL and 2D read APIs. The alpha worker's allowed native original preparation is
outside that main-thread probe.

The unit paths are `apps/web/test/canvas/selection/overlap-picking.test.ts` and
`apps/web/test/canvas/selection/source-alpha-cache.test.ts`. Run the browser
scenario against the isolated preview server on port 6102 using a local ignored
Playwright configuration, with one worker. Keep captures and reports in
`artifacts/designer-ux/`.
