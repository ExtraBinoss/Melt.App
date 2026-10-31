# Composition performance popover

The bottom-left artboard control shares the mode footer's height and zoom scale.
Opening it activates that artboard and requests a bounded measurement from the
existing canvas renderer. It does not create an export renderer or change the
portable document, revision or undo history. Outside interaction, canvas wheel
navigation, document replacement, provider replacement and timeout cancel the
request. No sampling runs on hover or while the popover is closed.

## Measured scope

The sampler measures twelve consecutive authored frames from the current
playhead, clamped to the composition end. Static scenes request twelve display
frames using the existing cache. Motion's original playhead/playback state is
restored only while the same document and composition still own the request.
Input cancellation restores synchronously before an editor gesture begins.
Sampling does not start audible playback.

CPU host elapsed includes preparation, native/queue waits and the imperative
Motion update. The reported value is the nearest-rank 95th percentile across the
sample. GPU time comes exclusively from Three's resolved timestamp queries when
the backend supports them; unsupported/failed queries remain unavailable. CPU
and GPU durations are independent, overlapping measurements and are not summed.
Observed frame interval includes diagnostic scheduling and presentation; it is
not a claim about hardware refresh rate or exclusive scene execution time.

Budget controls offer 30/60/120 fps and a custom target up to 360 fps. They change
the displayed work/budget ratios without repeating the measurement. Each timing
bar compares its own measured duration with the selected budget.

Draw commands come from Three's renderer info during the sampled frame.
Composition passes, uploads and preparation phases come from the compositor.
Animation host-update duration measures the imperative Motion update; overlapping
submission time is counted only once in the overall CPU host interval.
Texture bytes, cache entries and render-target counts describe the shared
renderer/cache. They are not exclusive allocations of one artboard. Cached
scenes can legitimately show one display draw and no new composition passes.

The inventory covers visible ancestry/opacity, groups, images, videos, vector and
primitive shapes, text, enabled effects/masks, Motion occurrences/channels and
standalone audio tracks. Audio-thread processing time is explicitly not measured;
counts do not assert audible output or attribute invented time to a layer.

## Extension and ownership

`getCompositionPerformance(engine)` owns a validated, immutable, bounded cache of
numeric snapshots with weak document references. Provider and document identity,
revision, abort signals and an eight-second timeout reject stale completions.
`registerPerformanceContributor` adds domain metrics without changing the sample
loop or popover. Domain/metric presentation definitions and twelve locale
resources live under `canvas/performance`.

`SceneProfileSource` is dormant until requested. It temporarily borrows Three's
renderer counters/timestamp flag, permits one pending timestamp resolution and
restores the original renderer settings on completion or cancellation. Three's
cached default-canvas descriptor also relinquishes borrowed timestamp writes.
Timestamp buffers contain timing metadata; no composition pixels are read back.
The existing renderer owns its bounded query-pool resources and disposes them
with the renderer.

Native checks use actual rendered frames and verify matched footer geometry,
measured meters, custom budgets, original playhead/revision, outside dismissal,
mid-sample cancellation and timestamp-buffer labels. The composition-switch
witness clicks both blank artboard paper and layer-list artboard rows, checks stable
peek layout, animated pinned panels and retained GPU passes/uploads.
