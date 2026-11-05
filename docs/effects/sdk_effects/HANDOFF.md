# Session handoff — 2026-11-05

> Superseded implementation state: see [current checkpoint](IMPLEMENTATION.md).
> The draft descriptions below retain the original transfer context.

## Resume instructions

Read this document, `AGENTS.md`, then this directory's README, architecture,
motion, effects and delivery documents. The user requested a context handoff;
implementation was interrupted at their request for clarification. Do not resume
large implementation automatically until the next chat's instruction establishes
the desired scope. Preserve all existing working-tree changes.

Workspace: `/home/albi/Documents/Projects/Hackaton/MuseArtWeb`.
Observed HEAD: `cfaccee` (`fix: refine Studio text, scale and pointer property controls`).
Other agents/sessions have committed changes during the conversation. This
handoff's SDK draft has not been committed, published, deployed or validated.
The working tree contains a substantial older Studio batch and unrelated ongoing
work; never reset it or stage everything indiscriminately.

The persistent development service is `melt-web-dev.service`, localhost:6100.
Keep it running. The user is actively using their workstation and strongly objects
to CPU saturation. Heavy checks must be serial, low priority, bounded CPU/memory
and no swap. Recent focused units used CPUQuota=25%; native Chrome checks used
CPUQuota=50%, one worker, MemoryMax=2200M. Do not run a full build/coverage/browser
campaign merely to resume context. No check or generator was left running by this
session; SDK workers were interrupted.

## User's intended SDK / Motion design

- A generic effects SDK: author typed metadata and TSL; Melt generates controls,
  validation, animation, history, previews and exports. Reuse the actual engine.
- Every effect should offer useful position, direction and application area on
  its object or composition, with XY pads, radius/aspect/feather and shared handles.
  Distinguish native algorithm direction from application-area orientation.
- Studio must expose the actual Classic Motion timeline below the canvas, with
  pin/peek and shared transport. There must be no second timeline/evaluator.
- Replace vague phase-only Animate authoring with one-click Loop, Ping-pong,
  Pulse, Pointer X/Y/XY, Drag and Click, with optional spring/rebound response.
- Numbers, colors and discrete controls should be driven through typed adapters.
  Flexible does not mean unvalidated `any` or arbitrary document paths.
- Interactive animation must be an ordinary timeline block, with recorded semantic
  inputs for deterministic scrub/export/headless replay. Sparse events/control
  points, not a document keyframe every frame.
- Keep visible UI compact: icons, toggles and short popovers, minimal prose.
- Mouse/touch/keyboard support must coexist with editing, orbit, gizmos and menus.
  Explicit interaction-test ownership is needed for consuming drag/click input.
- User requested the missing standalone effects. **Blocks is specifically a LEGO
  mosaic with source-colored bricks and raised circular studs**, not pixelation.
- A real 3D DOF must consume native depth, and a genuine temporal Trail must sample
  previous authored poses. Do not relabel radial blur or current-image clones.

## Plan delivered

`docs/effects/sdk_effects/` contains:

- `README.md`: intent, current architecture audit and unchecked delivery status.
- `architecture.md`: metadata, common placement, value adapters, GPU capabilities.
- `motion.md`: drivers, recording/replay, export, input ownership and timeline.
- `effects.md`: seven concrete effect specifications and distinctions.
- `delivery.md`: sequenced implementation and verification checkpoints.

These are plans, not evidence that the SDK is implemented.

## Draft effect code already written — not registered or tested

New pure-core definitions live at `packages/core/src/effects/<id>/definition.ts`;
new TSL graphs at `packages/render/src/effects/<id>/node.ts`:

| ID | Definition / builder | Draft behavior |
| --- | --- | --- |
| `risograph` | `RISOGRAPH_DEFINITION`, `risographNode` | Duotone/tritone inks, seeded independent registration, rotated dots, grain and paper; four source reads. |
| `oil-paint` | `OIL_PAINT_DEFINITION`, `oilPaintNode` | Alpha-weighted directional four-region Kuwahara approximation with 25 shared samples and detail restoration. |
| `blocks` | `BLOCKS_DEFINITION`, `blocksNode` | Sampled 2×1 source-colored bricks, two raised studs, analytic bevel/specular/shadow, gaps and stagger; six source reads. |
| `chromatic-aberration` | `CHROMATIC_ABERRATION_DEFINITION`, `chromaticAberrationNode` | Standalone radial/directional RGB separation, three source reads, alpha-safe sampling. |
| `wind` | `WIND_DEFINITION`, `windNode` | 12-tap directional photographic streak gather plus source, deterministic bands and explicit phase/time. |
| `trail` | `TRAIL_DEFINITION`, `trailNode` | Up to eight bound history textures; explicit temporal/offset modes; historical textures are NOT wired yet. |
| `depth-of-field` | `DEPTH_OF_FIELD_DEFINITION`, `depthOfFieldNode` | Native-depth gather draft; depth input is NOT wired yet. |

The first five have en/fr resources in the web effect library and English effect
docs, with prepared core/render tests. Trail has resources and a request helper
`packages/render/src/effects/trail/samples.ts`. DOF resources/tests/docs were not
finished before interruption. None of these new effects has passed native pixel
verification or a typecheck. Central EffectType, catalogs, renderer registry,
messages, search and thumbnails have NOT been integrated.

### DOF draft / unresolved design

Worker added `compositionDepth()` ports to `SpatialSources.ts` and
`spatial/scene/CompositionScene.ts`. Those files already contained other edits;
do not restore them from HEAD to discard this draft.

- Proposed borrowed port: `{texture, near, far, perspective}` for root depth scope.
- Existing depth target follows the current cropped presentation viewport.
- Root prepass must be selected rather than a faded group's isolated depth scope.
- Manual focus distance is stable. Point focus normalized to the full composition
  cannot sample an offscreen point from a cropped depth texture: resolve this
  before claiming viewport-independent focus. A dedicated full-page depth target
  needs explicit budget/accounting, or defer point focus initially.
- Local layer effects need a full layer→composition affine depth-UV mapping;
  initial genuine DOF should be composition-only, with truthful availability.
- Existing opaque prepass omits transparent/faded-group depth. Document limits.
- Node expects `EffectNodeContext.bindDepthInput()` returning a depth texture node
  and available/near/far/perspective uniforms; this interface is not added yet.
- Intended metadata `requirements: {depth:true, scope:'composition'}` is also not
  supported by EffectDefinition yet.

### Trail draft / unresolved integration

`getTrailSamples(effect,time)` returns at most eight exact prior rational times,
with slots, `beforeEffectId` and `history:'disabled'`. Negative times are omitted.
Node expects `bindHistoryInput(index)` with texture/available/flipY, not yet added.
Render upstream content at previous poses with the existing Motion program;
exclude the requesting effect/later stack and disable recursive Trail captures.
Preserve historical owner transforms, camera, masks and scope; copying only a
current cropped layer source is insufficient for trails of object movement.
Cache/admit/dispose all history targets under an explicit shared GPU budget.

## Draft Motion / interaction changes — incomplete

Worker modified:

- `motion/animations/{model.d.ts,compile.ts,commands.ts,validation.ts,validation-shared.ts}`.
- New `motion/drivers/{model.d.ts,compile.ts,validation.ts}`.
- New web `components/properties/effects/effect-motion/*` helpers/resources.
- Existing `state/session/effect-preview.ts` has draft changes; inspect its diff.

`AnimationChannel.driver?: MotionDriver` is evaluated by the existing
`compileAnimationChannel`. Timed drivers carry a rational period. Input drivers
carry semantic pointer/click events, an axis/initial value and analytic spring
frequency/damping. There are no frame-by-frame document keys.

`addMotionAnimation` layer variant gains `layerId?` and existing `effectIds?`;
exactly one occurrence/layer owner is required. Existing effects bind without
cloning, with `ownsEffects:false` preventing block deletion from deleting them.
This needs validation, pruning, duplication/copy and regression review.

### Important: new authoring UI is deliberately disconnected

The draft `EffectPlayback.tsx` was restored to its HEAD version while clarifying
scope, to avoid exposing half-integrated controls. Its draft is preserved in:

- Reviewable `drafts/effect-playback.patch` beside this handoff.
- Ignored `artifacts/studio/sdk-effect-playback.draft.tsx`.

Do NOT apply the patch before its core exports/targets are implemented.
The draft authoring helpers currently reference missing core exports/types:
`MotionDriver`, `MotionInputKind`, `MotionInputEvent`, `MotionSpringResponse`,
`compileMotionDriver`, `validateMotionDriver`, `compileAnimationChannel`.

Composition-effect target shape was agreed but NOT implemented:

- Scene owner: `{kind:'compositionEffect', compositionId, effectId}`.
- Scene channel: `{kind:'compositionEffect', property:EffectMotionProperty}` or
  `{kind:'compositionEffectSetting', property:string}`.
- Scene property target: same kinds plus compositionId/effectId.
- Include those descriptors in `listSceneMotionProperties` and the existing scene
  compilation/apply/commands/timeline paths. Do not create fake layers.
- The existing scene add-animation command still creates a spatial scene when
  absent; composition-effect animation must bypass that behavior.

Input helpers provide a recording test pad (touch/keyboard included) and
`effectInputSession(engine)` with `read/subscribe`, semantic emit and cancel.
Actual canvas-wide interaction interception is NOT implemented. New authoring
must not be described as finished based on the pad alone.

## SDK and Studio integration NOT started

- `EffectDefinition` has no new SDK metadata, shared domain settings or requirements.
- Common placement proposal uses collision-free `domainX/Y/Angle/Radius/Aspect/
  Feather/Enabled` settings, resolving defaults without rewriting legacy documents.
- Keep scalar resolution/patch behavior compatible, especially Gradient's custom
  settings resolver. Avoid silently adding all defaults on unrelated edits.
- `EffectParameters` still gates playback on a top-level time parameter. Expose
  generic animation and position controls for all suitable effects after integration.
- In App, the real `MotionTimelineDock` is still under `ClassicWorkspaceOnly`.
  Retain one shared dock/transport and handle Studio's floating controls/mobile
  reservations before moving it outside that condition.

## Previously implemented / focused verification

These predate the SDK draft and are separate working-tree work:

- Compact model library, shared 2D/3D text placement, generic notices/Undo details.
- Studio orbit/zoom, native full-window presentation and composition-effect Layers.
- Solid/gradient color access, shared radius tokens, clipped contextual-bar morphs.
- SVG stroke→filled-contour native extrusion through renderer-owned ClipperOffset.
  The exact Lucide icon regression caught a hanging triangle-union approach;
  current offset code passed actual native rendering/export and atomic undo.
- Pack scroll performance: all474 models now use ONE pre-baked native96px atlas,
 400,248bytes, decoded/verified/cached once. Runtime serial thumbnail rendering
  was removed. Scroll starts no GLB fetch or native preview renderer.
- Native hover still rotates through the retained renderer.
- Pack/SVG/catalog gutters reach the popover border; shallow layer trees do not
  overflow horizontally, genuinely deep expanded trees still scroll.

Relevant evidence under ignored `artifacts/studio/`:

- `pack-atlas-unit.log`: integrity/cache/offline/unique atlas-cell test passed.
- `pack-scroll-native.log`: pack thumbnails, zero GLB-on-scroll, offline reopen,
  pack gutter and SVG gutter/native export cases passed. The first layer test
  stopped at cold bootstrap under the CPU cap; it was rerun separately.
- `layer-gutter-native.log`: shallow/deep/reset horizontal-scroll regression passed.
- `svg-all-final.log`: all12 SVG/background integration units passed.
- `svg-native-presented.log`: actual stroked icon render/export/undo passed.
- `pack-atlas/report.json`:474 genuine native renders, zero production readbacks.
- `pack-atlas-rules.log`: zero rules violations BEFORE the SDK draft was started.

No full typecheck/build/coverage/native gate has passed for the current combined
working tree or the new SDK drafts. Do not convert prior focused results into that
claim. Changelog records earlier shipped-local changes; SDK implementation entries
and completion checkmarks still need actual delivered validation.
