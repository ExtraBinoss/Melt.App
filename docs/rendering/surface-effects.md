# Static surface effects

Ink Bleed, Pixel Sort and Edge Detection use the shared GPU effect stack for
images, shapes, text, video frames and rendered 3D layers. They have no time/speed
control, playback timer, temporal history or automatically generated keyframes.
An unchanged still image requires no further renders. Their settings remain
portable scalar fields, validated by the core effect catalog and edited through
normal commands, transactions and undo/redo. Names, parameters and choices are
localized in all twelve supported languages.

## Ink Bleed

The pigment source is either inverse luminance multiplied by alpha or alpha
alone. A threshold/softness pair extracts pigment; two eight-direction sampling
rings spread it into nearby fibres. Smooth seeded spatial noise modulates the
radius, independently of wall-clock time. Density, roughness and paper scale
control absorption. Pigment can retain the strongest neighbour's color or use
an explicit ink tint. Premultiplied mixing preserves partially transparent
edges. The transport admits `ceil(radius) + 1` document pixels on each side,
including when amount is zero, so an amount gesture does not resize the surface.

## Pixel Sort

A bitonic compare/exchange network sorts complete segments of 8, 16, 32 or 64
cells, horizontally or vertically. It orders RGBA samples together by luminance
or a selected RGB channel, ascending or descending. Cell size and segment offset
control the pattern. An incomplete segment at either image boundary retains its
source pixels. This is a bounded segmented sort; segment length is an explicit
control rather than an unbounded whole-image operation.

The respective costs are 7, 11, 16 and 22 fullscreen passes, including the final
amount/compositing pass. Each comparison samples its own and partner cell; it
does not scan/sort an image on the CPU. Cells use document units; lower-density previews reduce the sample count to a
power of two while retaining the authored segment width. The four sizes share one finish material, bounding the sort
network to 53 material variants per operator. The existing target pool reuses
two ping-pong surfaces; a mixed stack uses its existing shared backdrop copy.
No intermediate pixels or GPU buffers are read into JavaScript. GLSL comparisons
materialize keys and use structured branches, keeping TSL variable scopes valid
on both Three backends.

## Edge Detection

Two separable Gaussian stages provide adjustable smoothing, then one stage
computes the selected response: Scharr (default), Sobel, Prewitt, Roberts,
Laplacian or a difference of two Gaussian-weighted neighbourhoods. Derivative
kernels are normalized before gain, threshold and softness. Width sets the
sampling distance in document pixels. Luminance and alpha inputs support image
features and transparent silhouettes. Output can use two colors, reduce the
background opacity, invert the response or overlay edges on the source. The
final amount mix uses the original image rather than the smoothed intermediate.

The methods offer different derivative responses, not a universal quality
ranking. Reference kernels and smoothing principles:
[OpenCV gradients](https://docs.opencv.org/4.13.0/d5/d0f/tutorial_py_gradients.html),
[OpenCV Sobel/Scharr derivatives](https://docs.opencv.org/4.10.0/d2/d2c/tutorial_sobel_derivatives.html).
All passes use [Three.js TSL](https://threejs.org/docs/pages/TSL.html) through the
existing WebGPURenderer, including its WebGL backend.

## Editor title

The active editor owns `Project name - Melt` as its browser tab title. It follows
project replacement, rename and undo/redo, preserves literal authored characters,
and releases ownership when the project view closes. Dashboard and landing
routes keep their own titles. The shared brand configuration supplies the suffix.

## Verification

Core regressions cover validated ranges/choices, portable round trips, rejected
edits and undo/redo without switching still compositions into Motion. Pipeline
regressions cover bounded stages, stable identities and conservative outsets.
Resource tests retain existing scratch ownership, cleanup and output guarantees.
A native browser witness verifies ascending/descending ordering, color
permutations, transparent cells, incomplete segments, zero-amount identity,
time-independent results, all six edge kernels and the complete image-source
render/export graph on WebGPU and WebGL. It also processes fifty independent
image textures through the three-effect stack and checks retained memory and
material bounds, with actual JavaScript read APIs instrumented. PNG inspection
runs in a separate browser page, outside production readback accounting.

On 2026-11-01, Chrome 156 on Linux passed the WebGPU and WebGL witnesses,
including authored segment widths at reduced raster density. Fifty image
textures through the combined stack required two retained scratch targets
(49,152 bytes at 96 × 64) and 58 material variants after exercising all segment
sizes. All GPU/WebGL/canvas/VideoFrame JavaScript readback counts were zero.
The native title test also passed project load, rename, undo/redo and dashboard
navigation. Logs and captures are in `artifacts/surface-effects/`. These are
functional resource/correctness checks, not timing benchmarks; they used one
worker, one CPU core, no swap and a 3200 MiB memory ceiling.
