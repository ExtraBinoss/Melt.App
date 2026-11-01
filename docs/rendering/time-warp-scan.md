# Time warp scan

`time-warp-scan` is a registered source-local GPU effect, available to images,
video, groups and spatial sources through the ordinary effect stack. It uses the
same Motion evaluator and compositor for editing, previews and exports. Numeric,
choice, color and boolean settings use the existing property/keyframe registry;
there is no separate authoring state or persistence store.

## Controls

Motion compositions advance the scan from **Start** over **Duration**. **Manual**
clock uses **Progress**, which can be keyframed. Static compositions always use
Progress. Direction supports all four axes. Temporal samples controls the fixed
sampling grid (60 by default, 4–240). Drift, bend and zoom provide virtual source
movement, including for still images. Setting them to zero retains the original
source coordinates. Edges can mirror, extend or become transparent. Feather and
scan-line visibility, width and color control the boundary; Amount uses the
normal effect coverage/blending behavior.

A static image has no historical video frames. Its scan is an analytical virtual
move sampled at each pixel's scan position. Motion sources instead capture each
strip at its fixed composition timestamp. The layer's own placement and opacity
remain ordinary post-source transforms; to freeze movement of several layers,
apply the effect to their group. Effects before the scan are sampled at each
capture time. Effects after it process the combined frozen/live result. The
owner's mask is applied after its effect stack.

## Determinism and resources

An issued Motion frame retains a weak association with its immutable compiled
program. Temporal rendering re-evaluates that program at exact rational times;
it never creates keys or changes the document. Imported or cloned runtime plans
are rejected. Direct seeks replay the same sample grid as forward playback;
reverse seeks hide future captured strips. Sampling is quantized to the selected
grid, rather than depending on playback speed or dropped display frames.

Captured strips live in one source-sized GPU render target. A scissored copy
writes each strip without sampling its destination. There are no production
pixel readbacks into JavaScript. Source bounds are fixed when the first strip is
captured, including that source's effect outsets; later geometry is sampled in
this reference plane. A bounded nested compositor isolates the owner subtree,
mask dependencies and shared spatial context while preserving original media IDs.
Its cache reservation is at most 64 MiB and one quarter of the parent budget.
The history target and normal effect intermediates also obey the parent hard
budget. Source/configuration changes reset history; ordinary boundary/line edits
reuse it. Cache eviction disposes targets. Closing the compositor also releases
the nested renderer resources and reservations.

Cold seeks can need several source renders. Work yields between groups of four
captures and checks cancellation/publication validity before GPU writes. A render
allows at most 256 source captures across nested effects and three temporal
source levels. Exceeding either limit reports an actual rendering error instead
of returning a partial success. The counter is shared by nested captures, so
stacking scans cannot create an unbounded replay queue.

## Verification

The focused regression covers portable validation/history, clock advancement,
issued-program resampling, exact 1/30-second subdivisions, source graph isolation,
mask/spatial dependencies, generated localized controls and retained scene
publication. Existing compositor, effect pipeline and registry tests are included.

The native browser witness runs on Chrome 156.0.8078.79 with both WebGPU and the
Three WebGL fallback. It encodes a real three-color video source, checks strip
colors in all directions, compares forward/reverse/direct seeks, tests manual
progress, still-image edge modes, spatial inputs and an uncommitted catalogue
preview. It also exports and independently decodes a four-frame video. Production
read API probes observe zero GPU buffer, WebGL, canvas and VideoFrame pixel reads;
inspection reads occur on a separate page. The 50-image/100-effect workload plus
one temporal scan charges approximately 98.18 MiB against a 256 MiB session cache
budget in this fixture. This is a bounded resource check, not a frame-latency
benchmark. Browser verification uses one worker, one CPU core quota and a 3200 MiB
process memory limit.

The feature's source/test dependency closure passes strict TypeScript and scoped
lint. The repository-wide typecheck also reports unrelated existing test-fixture
errors in `TimelineZoom.test.tsx`, `use-timeline-layer-drag.test.ts` and
`packages/core/test/motion/interpolation.test.ts`; those files are outside this
change. This feature validation does not claim a passing complete CI/release gate.
