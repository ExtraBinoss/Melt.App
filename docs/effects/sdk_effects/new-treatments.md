# Additional image treatments

These treatments use `EffectDefinition`, validated engine commands, generated
controls in all twelve supported languages, the shared application area and the existing Motion
property registry. There is no separate effect editor, renderer or animation clock.
Existing portable IDs, including `blur`, `trail`, `ripple` and `ink-bleed`, retain
their meaning.

## Glow and Neon Melt

`glow` extracts visible highlights using a soft luminance threshold. Dense Gaussian
prefilters precede wider kernels, preventing isolated highlight replicas when the
halo grows. The final kernel combines Gaussian scales. Tint, intensity, radius,
threshold, threshold softness and glow-only output are ordinary SDK parameters.
Black and transparent hidden RGB do not emit light. Light expands coverage and
is combined in premultiplied space; glow-only exports retain transparency.

`neon-melt` adds an authored liquid displacement and tone-to-palette remapping
before using the same bloom implementation. Acid, Spectral and Ultraviolet palettes,
contrast, palette shift, liquid scale, distortion, direction and explicit phase
are editable. This is Melt's interpretation of psychedelic neon treatment, rather
than a claim of matching a third-party effect called Acid Glow.

Glow uses 2, 4, 6 or 8 GPU passes for radii up to 4, 16, 64 or 256 document pixels.
Neon Melt adds one preparation pass. Halo support is admitted conservatively for
the entire filter chain; Neon also admits the liquid displacement. All intermediate
textures belong to the existing bounded effect pool. No image pixels are read
back into JavaScript.

## Progressive Blur

The existing `blur` ID gains a `progressive` technique. Linear, radial and sharp-band
fields vary the actual convolution radius. Start/end stops, progression curve,
inversion, center and direction remain editable. Stops can be reversed; coincident
stops produce a hard transition. Existing Gaussian defaults and old blur settings
remain compatible.

Dense fine passes precede wider separable passes to avoid regularly spaced source
replicas. This is a bounded spatially varying artistic blur, not native depth of
field. Passes evaluate the authored radius field, so sharp boundaries can differ
from an exhaustive per-output-pixel Gaussian integration. The support fits inside
the existing blur footprint. Up to ten passes cover the complete supported scale
range. Optional center protection restores the original input at the final stage.

## Repeater

`repeater` arranges upstream paint in a line, grid or circle. Count includes the
original and is capped at 16. Copies support authored-pixel spacing/radius, direction,
per-copy rotation, additive scale step and exponential opacity. The source remains
editable; copies are visual paint instances, not independent scene objects.

The footprint transforms every upstream padded corner, including earlier effects,
using the same owner dimensions and transforms as the shader. Additional surface
area participates in normal preview cost admission and GPU cache limits. Large
arrangements may be downscaled or rejected by those existing resource limits.

## Wave Distortion

`wave-distortion` moves content along an authored direction. Sine, triangle, square
and sawtooth waveforms have amplitude, frequency and explicit phase controls.
Transparent, mirrored, repeated and clamped source edges are supported. Amplitude
is measured in document pixels, independent of raster density and transport padding.
Ripple retains its separate concentric-refraction behavior; Gradient Waves remains
a procedural color field.

## Shape Grid

`shape-grid` reconstructs image tones with an adaptive five-shape ladder or a chosen
dot, ring, diamond, square or cross. Each cell uses five alpha-weighted samples.
Cell size, fill, stroke, rotation and contrast are adjustable. Colors come from
the original or a three-color palette, with optional colored backgrounds. Output
coverage never exceeds the original source alpha, even with an opaque background.

## Watercolor

`watercolor` is a bounded artistic filter: a 25-sample edge-aware wash simplifies
regions; seeded paper fields drive diffusion, granulation and pigment density;
local contrast controls pigment pooling and darker edges. Paper tint and grain
are adjustable, while output preserves the original per-pixel alpha. This is not
a water-flow/drying simulation. Ink Bleed remains a distinct absorption treatment.

## Animation, placement and compatibility

All new numeric and color parameters participate in the existing animation and
recording system. Direction and preferred animation targets are declared by each
effect. Procedural phase/seed are explicit, so scrubbing and exports do not depend
on previously viewed frames or a wall clock. Owner coordinates exclude padded
transport margins. The shared application area blends against the unchanged
upstream input, including outside the affected region.

The focused native witness is `test/browser/sdk-new-effects.spec.ts`. It decodes
real PNG exports on a separate inspection page, checks both Three.js backends,
amount-zero identity, partial opacity, parameter changes, application-area changes,
layer/group/composition scopes, layer masks, stack order and transparent highlight
calibration. A mixed 50-image workload checks bounded GPU accounting and actual
readback counters. Captures and reports are written under `artifacts/sdk-effects/`.

## Validation record — 2026-11-06

- 91 focused core/render/UI tests passed across 21 test files, including SDK
  parameter schemas, validated transactions, undo/redo, animation capability,
  stage graphs, cache cleanup and dimension-aware stack footprints.
- Native exports passed on WebGPU and Three.js WebGL fallback in headless Chromium
  156.0.8078.4 on Linux, one browser worker with the repository Vulkan/SwiftShader
  launch flags. These are correctness checks, not hardware performance benchmarks.
- All seven treatments passed decoded PNG identity, opacity, localization, mask,
  scope and parameter-change checks. Wide Glow radii 3/32/128 passed transparent
  highlight and black-source calibration. Native captures live in ignored artifacts.
- A mixed 50-image WebGPU workload used one original upload and 6,728,572 accounted
  cache bytes against a 67,108,864-byte budget. GPU/WebGL/Canvas pixel read counters
  remained zero during production rendering.
- All 59 searchable raster effect/adjustment previews were baked from native graphs
  with zero production pixel readbacks; geometry-only entries are excluded.
- Production-source TypeScript, the stricter pure-core TypeScript configuration,
  scoped type-aware lint and repository contribution rules passed. The repository's
  full TypeScript invocation still reports pre-existing errors in unrelated tests.

## Localization

All twelve advertised locales own their effect names, descriptions, SDK parameter
labels, choice labels, application-area help, Motion controls, transition styles,
blend/alpha operators and canvas gizmo instructions. Effect resources load through
feature-scoped `localeResources` wrappers; no new runtime translation service or
network fetch is introduced. Animation endpoint choices resolve their SDK option
label while retaining the same portable option ID.

`effects-locales.test.ts` checks key/interpolation parity and direct locale bundle
lookups for every registered effect. English fallback cannot satisfy a missing
locale entry. The native effect-locale witness checks German, Japanese and Arabic
controls, endpoint menus, search, focus restoration, nonmodal overlays and RTL.
