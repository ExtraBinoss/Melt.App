# 09-scene-timeline: implementation and verification

## Owner handoff

- [x] Implement the intended result using the frozen shared interface.
- [x] Prepare focused behavior/native regressions and report changed paths.
- [x] Confirm undo/redo, cancellation, stale ownership, validation and cleanup in the implementation and prepared regressions.
- [x] Provide an English changelog bullet and explicit remaining limitations.

Camera, Environment and each durable light now have genuine scene owner rows in
both Animations and Keyframes. Scene properties share the existing canvas index,
virtual gutter, keyboard navigation, marquee, key selection, drag, delete and
easing controls. Scene action blocks reuse the existing summary/key gesture for
movement and trimming. Shared channel details, action menus, Save preset and My
presets accept scene recipes through the frozen core owner API; no layer or
occurrence proxy is created. Explicit block activation or Edit reveals the
existing camera/light owner controls and channel details. Pointer selection and
continuous dragging do not open an owner editor.

Owned implementation paths:

- `apps/web/src/components/motion/scene/**`, `tree.ts`, `TimelinePanel.tsx`,
  `TimelineRows.tsx`, `KeyframeMarker.tsx`, shared `canvas/**`, `gestures/**`,
  `gestures.ts`, `selection/ranges.ts`, `easing/**`, and the layer row type adapters.
- Shared `apps/web/src/components/motion/animations/**` authoring, summary blocks,
  details, channel presentation, picker/grid, action menus and presentation state.
- `apps/web/src/components/spatial/{SceneMotionField,SpatialSceneProperties,SpatialLightEditor}.tsx`,
  `use-scene-motion-navigation.ts`, `presentation.ts` and all 12 spatial locales.
- `apps/web/src/services/motion/animations/presets.ts`; the existing global store
  retains its UUID, revision, bounded cursor, atomic write and tombstone contracts.

Prepared focused regressions:

- `apps/web/test/components/motion/scene/timeline.test.ts`: real owner rows,
  implicit default scenes without fabricated lights, shared canvas/marquee,
  mixed scene/layer gestures, cancellation, one undo transaction and both ordinary
  and derived scene easing.
- `apps/web/test/components/motion/scene/catalog.test.tsx`: owner-compatible
  categories, translated direct/derived/property names, actual light type choice,
  explicit owner navigation, manual dismissal, stale pending editor requests and
  actual context-menu close-focus handoff to a persistent light editor.
- `apps/web/test/components/spatial/SceneMotionField.test.tsx`: action points are
  never accessed for animated-presence metadata; repeated transport updates
  retain metadata and React commits, and commit/undo refresh the diamond state.
- `apps/web/test/services/motion/animations/presets.test.ts`: scene recipe
  roundtrip, no embedded owner IDs, shared revision checks and deletion protection.
- `apps/web/test/components/motion/canvas/overlay.test.tsx`: retiring a focused
  semantic target returns focus to the timeline after same-owner edits, without
  stealing external focus or focusing a replaced project.
- Updated `apps/web/test/components/spatial/SpatialLightEditor.test.tsx` for the
  explicit translated Light type label.
- `test/browser/scene-motion-timeline.spec.ts`: native row picker application,
  canonical/root commit stability during previews, one move commit, undo/Escape,
  derived point/easing controls, mixed keys, deletion/undo, camera/light Edit and
  saved scene recipes rebound to another composition. Geometry and selection
  checks use actual viewport/hit/paint state; PNG/JSON evidence is written under
  ignored `artifacts/motion/scene-timeline/` before result assertions.

The gesture controller retains its existing disposable preview, pointer capture,
auto-scroll, engine subscription and single-transaction lifecycle. Cancel restores
its captured state; canonical project/page/revision/selection leases reject stale
completion. Focused semantic controls retire to the existing focusable Canvas
root after same-project/page commits, preserving subsequent keyboard deletion;
external focus and project replacement are excluded. Editor requests capture project identity and page ID and are consumed
once, so a later load or page switch cannot open a reused portable animation ID.
Context-menu owner navigation runs after menu close focus, suppressing only that
explicit handoff and retaining the captured revision guard. Owner navigation and
details subscriptions unsubscribe on unmount. Animated
presence uses a shared WeakMap only for certified immutable authored pages and
reads source metadata rather than materializing points on transport ticks.

Suggested English changelog bullet:

> Add Camera, Environment and per-light Motion timeline rows with shared action
> blocks, editable keyframes/easing, owner navigation and reusable personal presets.

Remaining limits: ordinary Inspector Auto-key keeps the established direct-key
composition semantics; action channels are edited explicitly in their details or
projected Keyframes rows. Scene recipe cards use an owner icon rather than the
unrelated layer photograph preview. No performance benchmark or universal latency
claim is made. The worker ran formatting only; all code, native, rendering and
acceptance checks remain the coordinator's responsibility.

## Coordinator acceptance

- [x] Review full diff against intended result and architecture contracts.
- [x] Run focused integrated code checks, serially with bounded resources.
- [x] Verify actual native timeline input and rendered/decoded exports on both backends where relevant.
- [x] Verify native Cornell camera motion, fixed object/light poses and seamless endpoints.
- [x] Run affected TypeScript/lint/format, synchronized versions and zero-rule checks.
- [x] Record evidence and resolve failed acceptance criteria through the owner.
- [x] Move this complete directory to validated/ after all criteria pass.

## Validation evidence

All acceptance checks passed; see [coordinator evidence](../../scene-motion-validation.md). Worker reports were reviewed and relevant focused/native/static checks were run by root.
