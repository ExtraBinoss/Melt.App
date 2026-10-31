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

Each layer renders a lit source into a linear half-float target with depth and
four-sample coverage. A native TSL pass applies ACES and the working RGB transfer
before the existing composition graph. The same graph serves the canvas,
selection previews, still exports and Motion encoding, including Three's WebGL
fallback. No production GPU pixel readbacks are introduced.

Layers retain the classic 2D stacking order. Depth, refraction and shadows work
inside an individual source, including an imported GLB's complete internal
hierarchy. Separate layers do not occlude or cast physical shadows onto one
another. Lighting and the camera settings are shared by their composition.

Text extrusion consumes the actual shaped glyph contours, kerning and layout.
Its editable gradients are live material uniforms. SVG parts retain their fill
rules, transforms and optional original paints; paint changes retain geometry.
ShapeMorph contours are sampled deterministically in the geometry worker.
Filled contours are flattened at the authored curve subdivision, then unioned
with their nonzero/even-odd winding rule before Three triangulation. This handles
self-overlapping variable glyphs and SVGs without filling their counters.

## Authoring and Motion

G/R/S select translation, rotation and scale while 3D editing is active; Shift
snaps. OrbitControls change the composition camera. Normal handles return in 2D
editing mode. SVG point editing temporarily presents its flat source, without a
document edit or a change to canonical exports.

High-frequency gestures use retained scene drafts or an owned page preview.
Release publishes one validated transaction, including Auto-key routing through
the standard property registry. Escape, pointer cancellation, owner/time changes
and unmount discard the owned draft. Ordinary animation recipes still operate on
the classic layer; additional recipes address native rotations, scales and depth.
Imported animation clips sample explicit `clipTime`, never a wall clock.

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
`test/browser/spatial-import-motion.spec.ts`. They decode both backend PNGs and
an animated GLB video, import a real HDR panorama, drag native rotation rings,
orbit the camera, switch projections and undo. Gesture assertions check the
large React surfaces, retained renderer ownership and idle frame stability;
readback instrumentation checks the production paths.

The implementation was checked on Linux with Chrome 156.0.8078.79, a
1600 × 1000 viewport and one bounded browser worker. These are rendering and
interaction correctness checks, not physical display-latency benchmarks.

The 50-image effect stress run produced its initial native-density round trip
and active/neutral full-resolution PNG captures, then was stopped when its
3,000 MiB memory high watermark caused reclaim pressure. Its complete
preview/export/recovery scenario is not counted as passing in this cohort.
