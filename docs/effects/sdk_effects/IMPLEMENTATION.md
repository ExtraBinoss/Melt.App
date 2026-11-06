# SDK implementation checkpoint

The earlier handoff describes drafts before this implementation. The current
working tree now connects the SDK, Motion authoring and effect registries. The initial implementation is committed; unrelated local changes are preserved.

| Domain | Implemented |
| --- | --- |
| Author contract | Public `defineEffect`, `effectFields`, typed `EffectNodeBuilder`/context/uniforms and source/coverage helpers. |
| Existing raster effects | Central SDK migration, typed generic controls, optional application area, shared GPU finishing and fallback radial handles. Legacy documents resolve area defaults without serialization. |
| Studio timeline | The retained Classic dock outside the workspace filter, Static/Motion selection, pin/peek, touch access and bottom-control clearance. |
| Motion | Timed drivers and sparse recorded input, analytic springs, displacement drag/release, click impulse/toggle, ordinary editable blocks, composition effect targets and shared evaluation. |
| Interaction | Recording-only canvas ownership with owner-coordinate mapping, controls excluded, mouse/touch/keyboard and lifecycle cancellation. |
| New source treatments | Risograph, Oil Painter, Chromatic Aberration, LEGO-style Blocks and Wind registered with controls, localization, search and native builders. |
| DOF | Real borrowed native depth for composition and native objects/groups, manual or GPU point focus, exact owner/window mapping and bounded quality controls. |
| Trail | Exact prior authored poses for composition, objects and groups through Motion; isolated upstream paint, retained native context, projective mapping, historical bounds and bounded GPU snapshots. |

All 53 active effect thumbnails now use a photographed source selected through
`EffectDefinition.sdk.preview`. Four generated originals are bundled under
`apps/web/public/effects/sources/`; their exact prompts/provider are recorded in
`GENERATION.json`. The native serial bake produced one hashed 967,160-byte WebP
atlas with zero production GPU, WebGL, Canvas2D and VideoFrame readbacks.
Studio displays large photo cards; Classic retains its virtual list with larger
static thumbnails. No source photograph or effect renderer is loaded for browsing.
Object depth and temporal captures are implemented in the follow-up described in
[DOF](depth-of-field.md) and [Trail](trail.md). Native depth retains the existing
opaque-material eligibility; post-composite masks affect color after native depth.

Validation is deliberately limited during implementation. The initial dock units
passed ten cases, with one timeout under the 25% CPU quota. Browser dock attempts
exposed cold-bootstrap/test-transition timing issues; they are not recorded as
passing witnesses. Those repeated attempts were stopped at the user's request.
Core strict typing passed after fixing the optional-gizmo declaration. The final
focused source check also passed for the shared effect fields, composition edits,
SDK controls and render exports (`sdk-integration-types.log`). Checks ran serially
under a 50% CPU quota, bounded memory and no swap. The earlier whole-tree compiler
was stopped after memory-high throttling and replaced by source-focused checks.
`git diff --check` passed and localhost:6100 returned HTTP 200.

No full build, coverage, load or native pixel campaign has passed for this SDK
implementation. Prepared regressions remain available for the later verification
batch. Do not infer native pixel verification from registration, node construction
or TypeScript checks.

The simplified Motion popup exposes eight icon actions by default, with optional
settings mounted on demand. Static Studio now always displays a labeled Motion
entry at the canvas bottom. Focused units passed for both entry initialization and
effect actions (three cases total). A real Chrome component witness verified the
entry, shared ruler, one-click block/autoplay and compact hit target. The full
editor smoke stopped at cold startup before executing functional assertions; it
must not be presented as a full app pass. Native card geometry was inspected and
verified at 121.5px photo height with readable labels. Captures and witnesses are
under ignored `artifacts/studio/motion-simple-*` and `photo-catalog-*`.


## Native object follow-up validation

The object-depth/point-focus and temporal-owner implementation passed focused
core, renderer, compositor and catalog regressions. Direct native pixel witnesses
passed on both Three WebGPU and WebGL backends: local DOF preserves an untouched
neighbour, point focus restores the native sharp source, offscreen full-gate focus
matches cropped output, and exact repeats match. Object Trail preserves prior
owner/parent poses, masks and neighbour isolation across random-access replay and
preview density, with zero production readbacks and released GPU allocations.

The Studio native witness verifies first-click outside dismissal, quick reopen
and Escape focus, nested menu ownership, shared scroll shadows (including no fade
when content fits), no body style locks, and the compact right-side action layout
at narrow width. Renderer strict source typing, focused lint and repository rules
are checked separately from CI's full build/coverage/release gate. Evidence is
retained under ignored `artifacts/studio/object-*` and
`studio-effect-dismissal-final.log`. Checks run serially with CPUQuota=50%, bounded
memory, one worker and no swap; these are correctness witnesses, not latency or
120 Hz display benchmarks. Unrelated in-progress media/effect changes are excluded
from the reviewed source snapshot.
