# SDK architecture

## One definition, shared behavior

Extend the existing `EffectDefinition` rather than introducing a competing plugin
format. Preserve parameter IDs and portable effect IDs. Definitions declare:

- Stable ID, localized labels/search terms, category and defaults.
- Typed parameter domain, display mapping, step, interpolation and visibility.
- Optional grouping into primary, spatial and advanced controls.
- Semantic roles such as phase, amount, color, position X/Y and direction.
- Preferred one-click animation targets and compatible driver presets.
- Coverage behavior, conservative bounds, source requirements and GPU resource cost.
- Optional native direction/position bindings and common application-area support.

The TSL builder receives retained uniform bindings, original/source sampling,
logical owner coordinates, explicit time/seed and declared auxiliary inputs.
Simple effects need only one node builder. Multi-pass filters, depth-dependent
filters, temporal sampling and geometry sources declare their requirements via
typed renderer-owned capabilities; they do not add per-effect editor components.

Registration contains definitions and builders, not implementation switches.
Generate or validate the manifest so missing core/render/localization registrations
fail visibly during development. Unknown imported effect IDs remain real errors.

## Common placement and application area

Use collision-free declarative settings (`domainX`, `domainY`, `domainAngle`,
`domainRadius`, `domainAspect`, `domainFeather`, `domainEnabled`) shared by built-ins.
Defaults resolve without serializing new keys into unchanged legacy effects.
The same metadata provides validation, generated UI, Motion capability and gizmos.

Coordinates are normalized to the authored owner, with X right and Y down. They
must account for expanded transport margins, nested transforms and composition
viewport windows. Raster scale, DPR and print DPI never change their meaning.

The shared GPU finishing stage combines the processed effect and its unchanged
input using an antialiased, feathered local influence field in premultiplied
space. Keep the existing coverage, opacity, blend and mask semantics. Outside
the region, the effect's input is preserved, including its alpha.

Native direction metadata binds to a real algorithm parameter where available
(wind angle, brick grid orientation, aberration axis, print screen angle). For a
nondirectional operation, direction orients its application field. Do not rotate
the source image or expose a parameter that produces no visible change.

## Value adapters

Keep the existing numeric/color/discrete property registry authoritative.
XY controls bind two scalar targets rather than hiding a vector in an untyped
string. Color interpolation uses the engine's color rules; discrete values use
hold interpolation. Macro controls expand to real parameter edits atomically.

Metadata is extensible; document inputs are strictly validated. Optional custom
controls are reserved for genuine domain tools such as Liquify painting, and
continue publishing ordinary validated engine commands.

## GPU inputs

| Requirement | Renderer responsibility |
| --- | --- |
| Source / backdrop | Existing GPU textures, alpha convention and footprint. |
| Images | Existing verified portable asset references and bounded texture cache. |
| Depth | Native scene depth with camera near/far/projection and exact UV mapping. |
| Previous samples | Bounded deterministic sampling of the upstream scene at authored timestamps. |
| Geometry | Existing preparation workers and source registry. |

Temporal samples must exclude the requesting temporal operator to avoid recursive
evaluation. They use the same scene evaluator as export and never depend on a
previously viewed frame. Depth must belong to the actual rendered camera/window;
absent depth cannot silently become a radial blur.

## Code ownership

- `packages/core/src/effects`: definitions, defaults, semantic metadata, validation.
- `packages/core/src/motion`: targets, drivers, input takes, compilation and replay.
- `packages/render/src/effects`: TSL nodes, typed capabilities, bounded resources.
- `apps/web/src/components/properties/effects`: shared controls and Motion popover.
- `apps/web/src/canvas`: pointer adapters, gizmos and interaction ownership.
- `apps/web/src/components/motion*`: existing timeline projections and transport.
- `apps/web/src/ui/studio`: presentation of those shared components.

Definitions and generated automation operations remain usable headlessly. Rendering
and browser encoding retain existing platform adapters; there are no production
GPU pixel readbacks into JavaScript.

## Implemented authoring API

`defineEffect` is exported from `@musart/core`. Define the existing typed parameter
union, defaults and optional `sdk: {direction, preferredTargets, placement}` and
`requirements: {depth, history, scope}` metadata. Register the definition in the
core catalog and the `EffectNodeBuilder` in the render registry. English/French
resources stay in the web library. An ordinary effect needs no React component.

The catalog installs `withEffectSdk` once for every raster built-in, including
legacy effects and adjustments. Geometry sources and retired definitions retain
their own declared capabilities. Common domain settings resolve lazily; unchanged
portable effects gain no serialized defaults. Parameter patches retain sparse
settings, and Gradient preserves its existing normalization and authored area.

The final GPU stage applies the common influence field after native treatment and
blend/composite operations. It interpolates premultiplied coverage against the
unchanged upstream input. Owner coordinates exclude expanded transport margins;
composition viewport crops retain full-composition coordinates. Generic radial
handles are supplied when an effect has no native gizmo. The shared controls
include an imperative XY pad plus generated scalar controls.

Native depth/history inputs are borrowed from their renderer owners. Missing
native depth is a real failure, not a simulated focus effect. DOF supports the
composition and native objects/groups. Its isolated owner depth maps through the
actual transport, parent layout and camera homography. Point focus renders one
GPU depth pixel at the full authored owner position, independently of the displayed
viewport; a maximum of 64 tiny focus targets and one local depth target are admitted
against the same spatial cache budget. Ordinary flat layers have no native depth.

Temporal Trail supports composition, layers and groups. It evaluates the same
immutable Motion program at exact previous times, truncates the requesting owner's
upstream stack, disables recursive temporal requests, and captures isolated owner
paint while retaining the complete native scene for depth, lighting and reflections.
Ancestor paint treatments are applied by the present graph, not duplicated in each
echo. Projective UV mapping and conservative historical bounds preserve previous
object/parent/camera poses outside the current silhouette. Snapshot density and a
capped child compositor are admitted against the parent GPU budget; there is no
dependence on previously viewed frames. See [DOF](depth-of-field.md) and
[Trail](trail.md) for material eligibility, masks and sampling limits.
