# Editable animation blocks

Motion opens with a block timeline. Each selected layer has an Animations section and an Add motion picker: two columns, categories, search, a built-in library, and a global My presets library. Static compositions do not show authoring keyframes. The Keyframes button explicitly enables the existing detailed timeline and inspector diamonds.

## Portable authoring

`MotionLayerTrack.animations` contains declarative `MotionAnimation` instances. Each instance owns its preset channels, exact start/duration, enabled state, intensity, and resolved effect slots. A channel contains normalized local points, easing, a registry-validated target, and an explicit add/multiply/replace operation. There is no second generated set of authoritative keyframes.

Presets and generated templates use sparse semantic control points. A simple move,
blur, scale or rotation normally needs two endpoints; intermediate points represent
actual stages, reversals or overshoots. Springs and Bézier curves are evaluated at
the requested timestamp without writing sampled frames back into the document.
Repeated geometry can use a parent/counter-transform rig instead of a long sampled
trajectory. This authoring policy does not discard a user's intentional detail.

Ordinary authored keyframes evaluate first, then enabled action channels compose in array order. Add and multiply are explicit; replacement intentionally takes precedence. Endpoints hold outside the local interval. Layer occurrence presence still determines visibility and which occurrence contributes. Numeric contributions clamp to the registered property range after composition. Relative width/height distances rebase on the target's current canonical dimensions.

Presets instantiate independent effects with document IDs. Core commands validate application, edits and deletion atomically through normal engine transactions. Undo/redo, serialization, duplication, occurrence movement and clipboard identity remapping retain animation data. Deleting a referenced effect prunes the dependent action. Applying or changing a saved preset never changes existing instances in other projects.

`scaleX` and `scaleY` are optional positive layer transforms, defaulting to one, around the existing center pivot. They are independent of source width/height, so text, groups and children scale through the same transform. Core geometry, mask matrices, primitive instancing, normal/special blends and root/child cache signatures use these transforms. Scaling does not invalidate an unchanged source texture.

## Composition-owned scene actions

Camera, environment and durable lights are first-class Motion owners. Optional
`CompositionMotion.sceneAnimations` stores ordinary declarative action instances
with a typed owner; existing `sceneProperties` retains directly authored keys.
Scene recipes share the generic preset/channel/instance contract, interpolation,
composition, point identities, retiming, easing and command machinery with layer
actions. They never manufacture layers or serialize a duplicate set of derived
keys. Imported values and owner references validate atomically, light deletion
prunes its actions, and composition duplication remaps owner and action identities.

Animations and Keyframes expose Camera, Environment and one row per authored
light on the shared timeline surface. Scene actions use the same block/key
gestures, cancellation and single-transaction undo. Explicit Edit reveals the
existing owner controls; a drag does not open an editor popup. Camera orbit/push,
light pulse and environment rotation recipes are filtered by the owner's actual
capabilities. Personal scene presets use the existing global UUID/revision/
tombstone store and carry no source composition or light IDs.

Direct keys evaluate first; actions compose afterward in authored order using
explicit add/multiply/replace operations, matching layer actions. Replacement
actions intentionally win over base keys. Their values and curves are edited
through action Details or their derived timeline points, without implicit
contribution inversion in Inspector fields. Preview and export sample the same
program. Cornell Box demonstrates one sparse eight-second camera orbit while
its objects and lights remain stationary.

## Library and previews

The catalogue contains 61 general recipes (31 property combinations and 30 native GPU reveal/style operators), plus three Typography recipes for editable text. All use the same validated animation channels and renderer. Typography adds source-owned contour morphing, per-letter timing and generated inflation/stretch, with authored vector states for precise designs; see [native contour morphing](../rendering/text-morph.md). Templates and browser previews do not implement an alternative animation engine.

The picker uses one retained GPU preview session and a shared locally bundled alpine-lake photograph. Only hover/focus starts playback; idle tiles own no animation loop. The canvas moves between tiles, work is latest-only and acknowledged, and document visibility, intersection, reduced-motion preference and disposal stop scheduling. Photo data is bundled locally and never fetched from a remote image service during browsing.

Personal presets live in a separate global `musart-motion-presets` IndexedDB database, independent of projects and their deletion. Every record has a UUID, revision and updated-order index. Cursor reads are bounded. Writes compare the current revision in a read/write transaction; deletion leaves a tombstone so delayed saves cannot resurrect a deleted preset. Errors are reported only as failures, and success is shown after transaction completion. Core extraction converts ordinary authored timelines to normalized, self-contained recipes without source project/layer IDs.

## Share Your Work reference

The photo-collage template retains eight licensed replacement photographs, centered scale, editable GPU blur, drop shadows and an interleaved card/text stack. Its current looping version is described below; the original reference analysis remains in [the shadow/blur contract](../rendering/effects/shadow-blur.md).

Generation uses public engine commands and records replayable batches. Photo source/license metadata lives beside the bundled JPEGs. The native template loader accepts an empty original-media sidecar list only when the validated project references no original-backed video/audio assets. PNG/JPEG image originals remain embedded in the portable project.

## Seamless branded templates

The durable `share-your-work` template ID now presents **Too Hot to Haunt**.
Its 1.2-second photo cycle uses ten editable action blocks over eight images.
Occurrences crossing the loop boundary are split and their channel curves are
clipped at the same phase; opacity and blur return continuously rather than
popping a card or resetting a drift. Preview playback shares the editor's
continuous phase and keeps loop samples below the exclusive composition end.

The durable `morphing-type` ID now presents **Melt Mascot** on white. A fixed,
mouthless mascot sits to the left; only its separate eyes move and blink. The
centered violet **MELT** lettering uses Inter Variable 800 and the original
67-pose timing and stretch envelope, reaching almost the full canvas height.
`scripts/templates/melt-lettering.ts` constructs fresh glyph contours from the
bundled font; it retains no reference-letter outlines or reference footer marks.
The six-second cycle returns both lettering and eyes to their starting state.
Both templates retain their public IDs for existing links and regenerate from
public command builders under `scripts/templates/`.

The Melt poster is encoded from the reviewed peak rendered frame. Its poster
and manifest URLs share an explicit asset revision, so cached older artwork
cannot remain paired with the new catalogue entry. Card captions sit below the
artwork; the card and detail preview preserve the template's white background.

`test/browser/template-seamless.spec.ts` verifies genuine WebGPU and WebGL
frames, exact first/terminal pixel continuity, changing intermediate poses and
white mascot corners. On Chrome 154/Linux at a 480 px output edge, both templates
had zero mean RGB difference at the seam and zero production pixel-readback
calls. This is a functional witness, not an input-latency or physical-display
measurement. Captures are in `artifacts/template-seams/`; the checked-in WebP
posters are native encodings of reviewed rendered frames. Verification is
serialized with a one-core CPU quota, bounded memory and no swap.

## Detailed timeline

Keyframes mode projects animation channels into property rows alongside ordinary authored tracks. Derived presentation IDs identify the animation, channel and point in the captured revision; they are never serialized as a second set of tracks. Dragging interior points updates normalized channel times. Dragging an endpoint changes the block interval while preserving intermediate absolute times; selecting every point moves the block. Crossings and negative intervals are rejected atomically. Endpoints remain required, so deletion removes intermediate points or complete channels while retaining at least one channel. Easing edits update the original preset channel. Live previews recompile only affected animation samplers, retain canonical documents, and commit once per completed gesture.

## Navigation compilation and presentation retention

`compileMotion` reuses at most eight programs per certified immutable engine
project, held in a WeakMap. Certified pages share their already validated/frozen
source graph; external documents still validate and receive a private frozen
copy on every compilation. Edits create a new project identity, so old programs
cannot mask changed tracks, originals or document data.

The editor transport retains at most eight sampled poses from that unchanged
project. Returning to the same composition and rational time reuses the page and
issued plan; edits, replacement and disposal clear the pose cache. Applying
validated Motion values to a certified page preserves its internal immutable
composition certificate. Untrusted external programs do not gain a certificate.

The GPU cache can reuse that exact certified pose through a new media-free plan;
materialized layer/effect values already contain every visual change. Media
requests retain their plan-clock invalidation, and video without a plan remains
ineligible. This avoids recomposition, source uploads and contour preparation on
warm composition switches without admitting stale video frames.

### Manual navigation validation

The production cohort on 2026-10-31 used Headless Chromium 156 on Linux,
WebGPU with an Intel Xe-LPG adapter, DPR 1, a 1600 × 1000 viewport and a
one-core CPU quota. The frozen build and source maps are retained under
`artifacts/switch-selection-cohort`, based on `09da4b0` plus the owned source
snapshot in `artifacts/composition-performance-source.diff`.

Native input clicks blank artboard paper through canvas picking and artboard
rows in Layers. Warm returns add no composition passes or uploads. In this
single cohort, input dispatch to the first observed ready-canvas RAF was
133.4 ms for paper and 34.2 ms for Layers; these are individual presentation
opportunities, not INP, physical display latency or a refresh-rate guarantee.
First-visit preparation is separate. A later 276.6 ms main-thread frame gap
remained in the warm paper observation window, so this does not establish that
all background/UI stutter has disappeared. Raw clocks, frames and environment
are retained under `artifacts/motion-melt-continuity` and
`artifacts/composition-final-latency.json`.

Focused checks also verify unchanged peek layout, animated pinned panels,
retained Motion controls and Morph-aware marquee/pointer selection. An existing
collapsed-group drag-over unit regression fails identically with the baseline
LayersPanel implementation; it is separate from composition activation.

## Shared timeline hierarchy

Animations and Keyframes project the same canonical foreground-first layer tree,
with the same collapsed layer IDs, selection, hover ownership, icons, editable
layer labels and layer drag controller. Animations keeps an editable occurrence
lane for each layer and nests each animation block beneath its owner. Its
projection omits property/keyframe expansion work. Keyframes exposes those
property rows when requested. Animation blocks and ordinary occurrence clips
retain their validated drag/trim/keyboard/context-menu handlers and undo behavior.
Both modes share row heights and the audio row presentation.

### Direct channels and shared gestures

Animations also projects each directly authored property as a named interval block,
without persisting a synthetic preset or duplicating its keys. Preset blocks project
existing channel point identities and use the same key gesture controller as Keyframes.
Moving the body moves all points; endpoints select the corresponding boundary points.
Snapping, live preview, stale-session rejection, cancellation and undo remain owned by
that controller. Block geometry follows its imperative preview subscription.

The simple row leaf reads canonical engine selection directly, retaining the dock's
selection-independent document subscription. Animation focus is cleared when its owner
is no longer selected. Both views use neutral hover and the track's media color only
for selected intervals. Inspector source summaries distinguish authored channels from
inherited ancestor motion and navigate to the actual owner.

### Spin recipes

The built-in clockwise/counterclockwise Spin presets use two linear additive
rotation points. Their Turns field edits the authoritative channel, baking any
strength into the two values once. Bloom Windows authors these presets through
`addMotionAnimation` for its parent and counter rotations, with ten turns over
its twelve-second composition. Direct custom channels remain available for manual
authoring; generated intervals never become a second persisted timeline.
