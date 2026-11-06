# Native 3D layer sources

A standard text, vector, rectangle or ellipse layer can carry an optional
`spatial` source. Its existing layout frame, ordering, groups, effects, masks,
opacity, history and Motion occurrences still apply. The canvas 2D/3D switch
changes the editing controls; it does not flatten or replace the source.

The portable composition owns its environment, camera and up to eight lights.
Geometry, mixers, materials, render targets, PMREM maps and decoder workers belong
to `packages/render`. UI state and borrowed R3F controls belong to `apps/web`;
`packages/core` contains only descriptions, validation and commands.

## Rendering

Each composition has one retained native scene, camera, environment and light rig.
The pure core `SpatialGeometry` maps authored layout frames into a stable world
plane, independently of camera orbit. A typed source registry shares canonical
primitive dimensions and intrinsic box/ellipsoid bounds with native builders.
Imported models use the same normalization extent; actual render cropping and
picking use prepared native mesh geometry. Portable TRS, optional affine bases and group
pivots determine object matrices; Three objects never enter document state.

A shared GPU depth prepass supplies inter-object occlusion and updates the common
shadow maps once. Each source renders its color contribution into a cropped,
linear half-float, four-sample surface. A native TSL depth comparison preserves
shared opaque depth while keeping independent layer/group treatments. Transport
bounds are expressed in the original layer's local coordinates, so the ordinary
compositor applies classic layout exactly once. A native TSL pass applies ACES and
the working RGB transfer before the existing composition graph. The same graph serves the canvas,
selection previews, still exports and Motion encoding, including Three's WebGL
fallback. No production GPU pixel readbacks are introduced.

Selection contours borrow only the used native source viewport, independently of
spare texture capacity. Screen derivatives keep the 1.25 CSS-pixel white stroke
stable across zoom, preview density and transformed sources. The display adapter
supplies the canvas CSS size once per draw; the contour quad includes the stroke
margin and guards sampling beyond the used rectangle. No extra GPU target or
pixel readback is required.

Classic selection frames, hover outlines and contextual toolbar anchors share
prepared native mesh bounds, projected into the layer’s local plane. Text layout
frames remain wrapping constraints. Classic resize handles scale native content
around the opposite visible edge; rotation preserves its visible center. Empty or
unprepared sources retain portable bounds until the native source presents.

Interactive previews keep native half-float/MSAA storage in 64-pixel buckets,
with one bucket of shrink hysteresis. The viewport and source crop remain exact;
the output pass samples only that used rectangle, so effect dimensions, seeds
and exported pixels do not depend on storage capacity. Cache admission precedes
resize, and insufficient padding budget falls back to exact storage. Exact jobs
always use tight storage. Projected effect planes retain their authored coordinates
when a grazing camera magnifies their logical transport. Their intermediate sampling
lattice obeys the acquired device limit and a charged working-set budget; forward
projection is clipped in homogeneous coordinates to the actual output window before
allocation. Near a projection horizon this can reduce intermediate sampling density,
without changing effect units, source anchors, or requested final export dimensions.
Native source rasters use the same explicit rectangle mapping; exact jobs retain
requested native density whenever it fits the device. Camera-only samples retain depth/reflection material
graphs; appearance, geometry, pose, lighting and native shader changes invalidate
their synchronization certificates.

Studio coalesces pointer camera drafts once per animation frame and bounds wheel
lookahead around the displayed pose, discarding the old target on reversal.
Pinch ratios retain their full authored travel. Canvas hover picking is suspended
during drafts and resumes from the retained pointer on return to canonical state.

Separate native objects share opaque depth and cast shadows onto one another.
Classic paint, blending, post-effects and masks retain their document ordering.
Fractional layer opacity does not write an opaque shared-depth holdout. A faded
ancestor group introduces a depth scope: its opaque children still occlude one
another before the group surface receives alpha, but do not hold out sources
outside that group. Nested faded groups introduce nested scopes. One reusable
GPU depth target switches scopes without retaining a depth texture per group;
the common native shadow maps update once for each composition sample. Material
alpha and transmission retain their native material rules independently of
layer/group alpha. Masks and effects remain post-composite treatments and do not
change native depth eligibility. Selection-export neighbours retain their native
depth, shadow and reflection roles while the compositor excludes their paint.
Transparent contributions retain document ordering; this is raster rendering, not
order-independent transparency or path-traced global illumination.

Scene reflections use a bounded set of native PMREM probes capturing actual
neighbour geometry and the shared lighting. Probes are shared by receivers,
cached by capture inputs, deferred during active preview gestures and throttled
during playback. An admitted deferred refresh retains its permission through its
own canvas submission; foreground edits or input revoke it. This prevents an
idle reflection refresh from invalidating its own admission and rescheduling indefinitely.
Exact exports update deterministically for their sampled scene.
GLB meshes (including original materials and animated skinning), extruded text and
native shapes all participate through their actual meshes and material properties;
reflection selection never branches on a primitive or template name. They do not
recursively reflect themselves or include post-composite 2D effects.
Draft/balanced/high limits bound capture resolution, probe count, meshes, triangles
and update cadence. Geometry, textures and skeletons remain borrowed; private
capture/material resources are explicitly disposed and charged to the GPU cache.

A group of enabled native objects receives a genuine 3D parent transform and a
shared pivot. Children retain independent editable sources and Motion tracks.
Ungrouping a fixed transform preserves the complete affine parent frame, including
nonuniform scale and shear, without decomposing or rewriting children's keys.
Animated group transforms must be removed before dissolving their hierarchy.
Selection exports retain a camera gate and shading-only neighbours so cropping
does not change the world, lighting, shadows or reflections.

Text extrusion consumes the actual shaped glyph contours, kerning and layout.
Its editable gradients are live material uniforms. SVG parts retain their fill
rules, transforms and optional original paints; paint changes retain geometry.
ShapeMorph contours are sampled deterministically in the geometry worker.
Filled contours are flattened at the authored curve subdivision, then unioned
with their nonzero/even-odd winding rule before Three triangulation. This handles
self-overlapping variable glyphs and SVGs without filling their counters.

## Authoring and Motion

G/R/S select translation, rotation and scale while 3D editing is active. Holding
Shift snaps translation to 0.1 world units, rotation to 15-degree increments and
scale to 0.1 increments. Modifier input follows the window and native pointer
state so it also works when Shift is held before the canvas gains focus; release,
blur and control disposal clear it. Precision snapping takes precedence over
nearby geometry attraction. OrbitControls change the composition camera. Normal
handles return in 2D editing mode. SVG point editing temporarily presents its flat source, without a
document edit or a change to canonical exports.

Native gizmo drafts also publish an engine-scoped, owner-checked field presentation.
Property number inputs subscribe imperatively to that sampled page, updating the
visible values without React owner commits. Cancellation, undo and scope changes
restore canonical values; release clears the transient page and its subscriptions.

High-frequency gestures use retained scene drafts or an owned page preview.
Release publishes one validated transaction, including Auto-key routing through
the standard property registry. Escape, pointer cancellation, owner/time changes
and unmount discard the owned draft. Ordinary animation recipes still operate on
the classic layer; additional recipes address native rotations, scales and depth.
Imported animation clips sample explicit `clipTime`, never a wall clock.

Composition Motion stores optional `sceneProperties` separately from layer
occurrences. Camera projection/orbit, environment intensity/rotation and durable
light properties use typed targets and the same validated keyframe commands,
interpolation, undo and frame sampling as preview and video export. Inspector
diamonds and Auto-key author scene channels; numeric playback presentation is
imperative, and discrete controls subscribe at their leaves. Deleting a light
prunes its channels atomically; composition duplication remaps all scene/light/key
identities. Camera, Environment and per-light timeline rows expose direct keys
and reusable Motion action channels with shared editing gestures and easing.
Scene actions store typed owners in optional `sceneAnimations`; camera/light/
environment values use the same preview/export sampler as layer actions.
Environment asset/preset changes remain structural, without keyframe support.

Engine-owned analytic lights use Three's renderer-local light-node extension
API to refresh color, intensity and point/spot parameters per render. Exact
samples and reflection captures can share one browser animation frame without
retaining an earlier sample's lighting. Owned lights dispose through the native
light lifecycle; borrowed source lights remain untouched.

Pure property descriptors declare geometry, appearance, world, projection,
depth, shadow, probe and compositing dependencies. The renderer interns shared
scene inputs once and uses compact per-source stamps. An opaque appearance edit
with environment reflections can reuse unrelated source/depth surfaces; scene
reflections retain neighbour dependencies. Material variants synchronize once per
sample and source passes bind only their own meshes. A scope switch may still
redraw shared depth; these bounds do not imply constant rendering cost.

## Assets and limits

Self-contained GLB originals and HDR/EXR/LDR panoramas use durable embedded asset
records. Original bytes stay separate from frequently changed project metadata.
Imports validate actual model resources or panorama pixels before publishing;
stale asynchronous results cannot overwrite a changed composition.

Preparation limits are explicit: 64 MiB per original, 64 active 3D sources,
one million GLB vertices, 256 GLB meshes, 32 million imported texture pixels,
4096-pixel individual GLB textures, and 800,000 extrusion vertices. Panoramas must
be 2:1 and at most 4096 × 2048. HDR/EXR decoding and linear downsampling run in
bounded workers; uploaded environments are at most 1024 × 512. Geometry preparation
also runs in a bounded worker. Targets, shadow allocations, environment scratch
resources and caches participate in the existing GPU budget.

The object library exposes all 21 Three geometry families and sixteen vendored
CC0 GLBs. Its tiles use a native static atlas; one retained, bounded native preview
spins the selected object without an editor document edit or React frame clock.
Immutable originals are size/hash checked, lazy and bounded independently from
GPU resources. See [the object library](../guides/spatial-library.md).

The material picker uses a static atlas baked from thirty actual native renders.
Opening it creates no preview renderer or continuous animation loop. The
composition profiler exposes prepared mesh, vertex and triangle counts alongside
the existing native renderer counters; it does not invent per-layer GPU timings.

See [the material atlas generator](../../scripts/spatial/README.md) and
[the performance protocol](../performance/protocol.md).

## Regression witnesses

Focused core, source-preparation, gesture and persistence tests cover validated
values, animation evaluation, asset dependencies, undo/redo, cancellation and
resource disposal. The native Chrome witnesses live in
`test/browser/spatial-render.spec.ts` and
`test/browser/spatial-import-motion.spec.ts`. Shared-scene regressions also live in
`spatial-composition.spec.ts`, `spatial-groups.spec.ts`,
`spatial-shadows.spec.ts` and `spatial-model-reflections.spec.ts`. They decode both backend PNGs and
an animated GLB video, import a real HDR panorama, drag native rotation rings,
orbit the camera, switch projections and undo. Gesture assertions check the
large React surfaces, retained renderer ownership and idle frame stability;
readback instrumentation checks the production paths.

The implementation was checked on Linux with Chrome 156.0.8078.79, a
1600 × 1000 viewport and one bounded browser worker. These are rendering and
interaction correctness checks, not physical display-latency benchmarks.

The subsequent optimization batch completed the full 50-image / 100-effect
preview, edit, strict-idle, 2400×1500 PNG export, save/recovery and persisted
768×480 thumbnail scenario. All production readback counters and browser errors
remained zero; charged cache bytes stayed below 384 MiB. This supersedes the
earlier partial stress run stopped on memory pressure. See
[the optimization validation report](../optimization_binoss/validation-results.md)
for scope, environment, actual evidence and remaining limits.
