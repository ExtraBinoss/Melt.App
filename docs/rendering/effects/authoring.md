# Shared procedural effect authoring

## Definitions and uniforms

| Authoring topic   | Contract                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect ownership  | Each effect owns pure metadata in `packages/core/src/effects/<id>/definition.ts`, its Three.js TSL graph in `packages/render/src/effects/<id>/`, and English/French resources under the web effect library. |
| Registries        | The registries contain definitions/builders only.                                                                                                                                                           |
| Imported settings | Imported settings reject unknown names, wrong types and out-of-range values.                                                                                                                                |
| Uniform updates   | Scoped values are resolved once per uniform update, with stable uniform identities; choice values use their declared option index and colors use encoded working RGB.                                       |

Definitions declare whether raw treatment coverage is preserved, reduced or expanded. Blur and Drop shadow explicitly expand their GPU transport bounds; [their contract](shadow-blur.md) describes margin admission, premultiplied sampling and mask mapping. Preserving builders retain the source-alpha graph directly; ink opacity and transparent cuts declare reduction and have native default/partial-cutout witnesses. Optional Porter-Duff compositing remains a separate operation.

The web catalog indexes localized names, families, internal descriptions and bilingual discovery aliases, plus the values and translated labels of each selectable option. A technique such as Gaussian or Bokeh finds the single Blur entry; it does not create another portable effect type. Effects and adjustments retain separate search categories. Keep catalog descriptions in its English/French resources and aliases in `catalog/search-metadata.ts` current when adding a treatment. These descriptions contribute to search without adding text to menu rows.

### Density, seeds and time

| Authoring topic     | Contract                                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spatial units       | All spatial fields use authored layer dimensions.                                                                                                                                |
| Reference transport | The complete stack, masks and isolated descendants use the common authored 1× reference and premultiplied GPU mip transport.                                                     |
| Zoom invariance     | A shader must not branch on editor zoom or change its seed with raster density.                                                                                                  |
| Integer seeds       | New seeded builders use the exact unsigned-integer seed uniform and keep seed offsets/frame additions integer through hashing; the legacy float port preserves older treatments. |
| Phase precision     | Periodic phases are reduced before multiplication by 2π or combination with spatial coordinates, avoiding Float32 loss at large valid times.                                     |
| Readback accounting | Test-only PNG decoding is isolated from production readback accounting.                                                                                                          |

Spatial fields must use the authored content rectangle even when a transport texture covers an infinite-canvas viewport or expanded effect margins. `shared/coordinates.ts` provides authored Y-up/Y-down pixels and normalized UVs, plus the inverse mapping back to texture UVs. Keep original texture reads and document-pixel convolution offsets in transport coordinates; map authored cell centers and transformed image positions back before sampling. Normalized centers, aspect ratios, paper/screen bounds, generated layouts and seed grids must never use the changing transport extent as their authored domain. Color-only operators and native depth lookups keep their existing texture coordinates.

Discontinuous fields can place an exact fragment center on a `floor`, `fract` or sign boundary. Receipt fibers and Gradient Blocks/Folds derive their authored pixels from Three's target fragment coordinates and the document-pixel footprint, avoiding the small interpolated-UV cancellation error that otherwise changes those boundary decisions when the transport extent changes. This preserves subpixel geometry without adding quantization or a boundary bias.

`test/browser/effect-viewport.spec.ts` exercises the related spatial operators on both composition and infinite-background owners. Its fixed authored interior keeps nonlocal sampling inputs available in both transports; Shatter's separate viewport witness also covers complete borders and cropped windows. These are native GPU pixel checks, separate from native wheel gesture checks.

### Native object planes

Native extruded text and SVGs provide a renderer-owned homography for their front
plane. Before the raster-effect stack, the compositor reframes the lit source onto
an authored pixel lattice. It then runs every effect and SDK influence area through
the existing operator and projects the premultiplied result back before masks and
composition. Authors write the same TSL and parameters; no effect-specific camera
code, document metadata or second renderer is involved. Camera zoom changes the
presentation size while local pattern coordinates remain attached to the object.

The source-plane and shared-stack regressions cover camera/projection changes,
parent/content transforms and the local reference lattice. A bounded native Studio
wheel witness also exercised Shatter, Grain and Halftone on real extruded text on
WebGPU and WebGL, retaining a 340 × 120 authored input through all nine camera
steps per backend. Captures and the report live under
`artifacts/studio/spatial-effects-source-report.json`.

### Radial gizmos

| Authoring topic    | Contract                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata           | An optional radial gizmo describes normalized center keys, an outer radius, an optional protected radius, radius units and optional ellipse aspect/rotation keys.                             |
| Derived geometry   | The canvas derives its geometry from that metadata, including nested owner transforms, without an effect-type switch.                                                                         |
| Preview and commit | Handles publish imperative layer previews; a completed drag commits one validated command.                                                                                                    |
| Cancel             | Escape, pointer cancellation and stale document/selection guards restore the original.                                                                                                        |
| Keyboard steps     | Arrow keys move handles by one document pixel; Shift uses ten.                                                                                                                                |
| Overlap resolution | Fixed-size pointer handles resolve overlaps by screen-space proximity, including nested transforms; the center takes exact ties and every handle remains keyboard accessible.                 |
| Pointer tolerance  | Transparent hit radius is `14 / zoom` around the existing `6 / zoom` knob. Preserve the grab offset so near-edge clicks and drags do not jump; interactions retain the owning effect popover. |
| Handle help        | Shared Radix tooltips wait 500 ms on every hover, explain the handle and keyboard controls in all twelve app languages, and close when a gesture begins.                                      |

### SDK placement and Motion

All raster built-ins and adjustments pass through the same SDK catalog adapter.
Authors declare ordinary typed parameters and a TSL `EffectNodeBuilder`; Melt
provides the generated controls, validated commands, shared area field and Motion
bindings. `defineEffect` and `effectFields` are exported by `@musart/core`; builder,
context, uniforms and sampling/coverage helpers are exported by `@musart/render`.
Optional `sdk` metadata identifies native direction and preferred animation targets.

### Photographic catalog previews

Every built-in effect and adjustment declares a photographic catalog source through
`sdk.preview`. The SDK supplies intentional defaults from
`packages/core/src/effects/sdk/preview.ts`; an effect's own `sdk.preview` declaration
takes priority. New effects must extend that exhaustive registry or declare their
own source when introducing their portable type. This is build-time presentation
metadata and does not add settings to existing user documents.

```ts
sdk: {
  preview: {
    source: "editorial-portrait",
    scene: "photo",
    effect: { amount: 0.8, settings: { /* declared effect parameters only */ } },
  },
}
```

The exported `EffectPreviewSource` accepts four stable source IDs:
`editorial-portrait` for original adult fashion/editorial portraiture,
`alpine-lake` for landscape detail and tonal/color grading,
`studio-still-life` for controlled product lighting and clean object silhouettes,
and `neon-city` for luminous urban detail and digital treatments. The corresponding
assets live under `apps/web/public/effects/sources/<source>.webp`; source IDs carry
no browser, asset loading or GPU dependency into core.

`scene` defaults to `photo`. Use `depth` for native camera-depth staging,
`temporal` for deterministic authored movement and history, and `typography` for
source content that demonstrates text reveals. Depth of field uses real scene
depth; Trail uses actual prior authored poses. ASCII and Receipt retain
photographic content so their character and print treatments remain recognizable.
Optional `effect` values are ordinary validated effect overrides for the baker;
they must use declared parameters and do not replace the effect's creation defaults.
Do not mimic an effect with a decorative thumbnail filter. Catalog images must be
rendered by the registered production effect and pre-baked into the static atlas.

The shared area uses owner-local `domainX/Y/Angle/Radius/Aspect/Feather/Enabled`
settings. Defaults are resolved lazily and do not rewrite old portable effects.
The GPU finishing stage preserves upstream pixels outside that area, in
premultiplied coverage, including expanded transport margins and viewport crops.
Native algorithm directions remain separate from the application-area angle.

| Authoring topic      | Contract                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility          | Numeric, integer, color, choice, boolean and text parameters use existing typed Motion adapters.                                                   |
| Time drivers         | Loop, Ping-pong and Pulse create ordinary editable action blocks with sparse output points.                                                        |
| Input drivers        | Pointer X/Y/XY, displacement Drag and Click record bounded semantic input; scrub/export use the same evaluator.                                    |
| Response             | Spring/rebound response is analytic and seek-safe; playback writes no document keys.                                                               |
| Input ownership      | Explicit recording owns consuming canvas input, excluding controls, orbit and gizmos; Escape, blur, visibility changes and cancellation retire it. |
| History              | A completed block/recording commits atomically; cancelled previews restore the original values.                                                    |
| Timeline             | Classic and Studio reuse the same dock, owners, block/key controls and transport.                                                                  |
| Auxiliary GPU inputs | Real depth and prior authored poses use declared renderer-owned capability ports, with bounded allocation and disposal.                            |

See [the implementation checkpoint](../../effects/sdk_effects/IMPLEMENTATION.md)
for current limits and validation status. Shader graph construction and TypeScript
checks do not establish native pixel correctness.

## Delivery checklist

1. Record primary visual and algorithm references, the intended appearance and deliberate limitations in the effect's own documentation.
2. Define bounded metadata, strict imported-setting validation and stable GPU uniforms in the appropriate core/render directories.
3. Register creation, search, menus, English/French controls and serialization through the shared catalogs.
4. Verify real photographs and calibration scenes on both WebGPU and Three's WebGL2 backend. Inspect decoded exports for alpha, color space, masks, nested groups, deterministic seeds/time and extreme settings.
5. Check preview/export agreement across zoom levels. For spatial or animated effects, verify native gestures, cancellation, one-entry undo/redo, phase capture and cleanup.
6. Measure resource bounds and instrument production pixel-read APIs. Keep generated captures and reports in ignored `artifacts/`, with the measured build and environment identified.
7. Run the focused checks required by [AGENTS.md](../../../AGENTS.md), document actual results and request an independent audit when the task requires one. Release-wide gates belong to release preparation.
