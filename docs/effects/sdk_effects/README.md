# Effects SDK, Motion and interaction

Status: implementation plan and active delivery checklist. This document does not
claim that unchecked capabilities already ship. Documentation is in English;
application controls use the existing localized resources.

## Product contract

An effect author supplies a typed definition and its Three.js TSL treatment.
Melt supplies controls, validated edits, history, animation, interactive input,
timeline presentation, compositing, resource ownership, previews and export.
Classic and Studio expose the same document and compiled program.

The authoring contract is extensible across numbers, integers, colors, choices,
booleans and text. Structural edits and asset replacement remain explicit commands;
they must not masquerade as interpolated scalar values.

Every effect can be localized on its owner with the shared position/direction/area
controls. An algorithm's native direction is distinct from the orientation of its
application area. Unsupported native directions must not become inert sliders.

## User experience

- One compact Motion control exposes icon tiles for Loop, Ping-pong, Pulse,
  horizontal/vertical/free pointer input, Drag and Click. Clicking a timed tile
  creates the animation, opens the shared timeline and starts playback. Clicking
  an interactive tile starts recording immediately. Range, parameter, period and
  response options mount only when Settings is opened.
- One click creates a real editable animation instance with sensible output range.
  A small popover exposes target, range/colors, period and response when needed.
- Effect authors declare preferred targets; the user can choose other supported
  parameters. Color uses a palette ramp; choices/booleans/text switch discretely.
- Position uses an XY pad; Direction uses an angle/direction control. Area adds
  radius, aspect and feather with shared canvas handles. Object-local and
  composition-local coordinates remain stable across viewport and export sizes.
- Studio mounts the actual existing Motion timeline below the canvas. Pin, peek,
  block editing and detailed keys retain the Classic implementation and transport.
- Interactive bindings appear as editable timeline blocks. Recording produces a
  replayable input take; it does not manufacture document keyframes every frame.
- Edit and interaction-test modes have explicit ownership. Drag/click interaction
  must not simultaneously orbit the camera, transform an object or activate a menu.

## Existing foundation

The current engine already provides substantial parts of the SDK:

| Existing surface | Current behavior / gap |
| --- | --- |
| `effects/definition.ts` | Typed declarative scalar controls, defaults, conditional visibility, texture inputs and radial gizmos. |
| `EffectParameters.tsx` | Shared UI generated from those definitions. |
| `motion/properties/effect.ts` | Numeric, color, choice, boolean and text animation inferred from effect metadata. |
| `MotionAnimation` | Sparse reusable channels with add/multiply/replace, easing and one authoritative timeline owner. |
| `compileAnimationChannel` | Shared layer/scene evaluator, also used for exact export. |
| `EffectPlayback.tsx` | Temporary `time` preview with a final phase commit, not a durable animation block. Replace this authoring path. |
| `MotionTimelineDock` | Existing pin/hover timeline, currently mounted under `ClassicWorkspaceOnly` in App. |
| Composition effects | Real GPU stack and Layers rows exist; animation addresses still need composition-effect owners. |
| Pointer input | Editor gestures exist; a typed portable interactive animation input/replay contract is missing. |

See [SDK architecture](architecture.md), [animation and input contract](motion.md),
[effect specifications](effects.md), and [delivery checkpoints](delivery.md).

## Boundaries

No second renderer, simulation clock, timeline or custom shader language is added.
Core stays pure TypeScript. DOM input adapters live in web; GPU resources and TSL
live in render. Portable projects contain descriptions and durable identities.
Built-in effect IDs and older project output remain compatible.

Live pointer position is not a video track by itself. Exact exported animation
requires recorded inputs or an explicit deterministic input sample. Never silently
claim that a pointer-dependent export reproduces an unrecorded live performance.

Implementation has resumed; see [the current code checkpoint](IMPLEMENTATION.md).
The checklist below still requires integrated/native verification.

## Delivery status

- [x] Audit existing metadata, animation properties, playback and timeline mounting.
- [x] Record the common SDK, interaction, effect and verification contracts here.
- [ ] Expose the retained timeline in Studio and verify pin/peek/layout ownership.
- [ ] Introduce shared effect placement/area descriptors and generated controls.
- [ ] Replace phase-only Animate with durable typed Motion drivers and blocks.
- [ ] Add recorded pointer/click inputs and deterministic preview/scrub/export replay.
- [ ] Add composition-effect animation owners throughout validation/history/copy.
- [x] Implement the missing standalone effects and migrate raster built-ins to SDK capabilities (native atlas bake completed; full editor/export validation remains below).
- [x] Bake all 53 active effect previews from SDK-selected photographs into a shared static atlas.
- [ ] Complete both-backend editor/export/interaction validation beyond the native bake and focused UI witnesses.
