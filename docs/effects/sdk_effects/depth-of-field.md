# Native depth of field

Depth of Field borrows actual camera-space depth from the native Three scene. It
works on the composition, an individual native object, and a group containing
native objects. A flat 2D layer has no native depth capability; missing depth is a
rendering failure rather than a replacement radial blur.

The composition reads its existing opaque native scene depth. A local object
filter renders that owner's actual prepared meshes into one reusable depth
surface. A group includes its native descendants. Neighbour depth does not
replace the local object's own distance: the upstream source color already has
shared-scene occlusion, while the filter gathers the owner's surviving color.
The depth mapping accounts for parent layout, expanded effect transport,
reprojected authored text/vector planes, the actual camera and the current output
window. Raster scale and texture capacity do not change the mapping.

`focusMode: "distance"` preserves the previous default and uses `focusDistance` in
positive camera-space units. `focusMode: "point"` uses normalized `focusX` and
`focusY`, with X right and Y down in the full authored owner. Composition points
refer to the full composition; local points refer to the authored layer/group.
The renderer draws the real native scene or owner through a one-document-pixel
camera gate centered on that point into a 1×1 depth attachment. The effect samples
that depth directly on the GPU. The focus point can lie outside a cropped preview
or selection export: it never samples beyond the cropped depth texture. A point
with no eligible native surface focuses at the camera's far plane.

Native material depth rules apply, including material alpha tests, depth writes
and opaque prepass eligibility. Composition depth retains its existing faded
group scopes. Local isolated depth retains native material rules independently
of document layer/group opacity. Masks, clipping, raster effects and their alpha
remain post-composite operations: they do not modify the scene's native depth.
This is raster depth of field rather than transparent volume/path-traced focus.
The gather uses 8, 16 or 24 color/depth pairs, bounded by `maxBlur`, and preserves
upstream alpha. `focusRange`, `aperture`, aperture blades/direction and depth-edge
protection control its result.

One reusable local depth target serves synchronous local filters. At most 64
active point-focus effects retain distinct 1×1 attachments per composition;
removed/disabled point effects release their attachment at scene synchronization.
Both the local raster and all point attachments, including a per-target overhead,
are admitted to the parent GPU cache before allocation. Camera, render target,
clear state, borrowed materials and source visibility restore even when a draw
fails. Cache disposal releases every attachment. No depth/color pixels are read
back to JavaScript, and focus has no dependency on previously viewed frames.

Focused code regressions are in `packages/render/test/spatial/effect-depth.test.ts`
and `packages/core/test/effects/depth-of-field/definition.test.ts`. These validate
coordinate arithmetic, actual scene ownership, offscreen focus projection,
budgets and lifecycle restoration; real browser pixels are a separate rendering
witness and are not established by mock-renderer tests.
