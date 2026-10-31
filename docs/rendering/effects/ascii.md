# ASCII rendering and custom character ramps

ASCII uses the image's authored cell grid, luminance and a small native glyph atlas
to draw a character treatment on the GPU. The same TSL graph serves editor
previews, local tools and image/video export; it never reads rendered pixels into
JavaScript. The algorithm extends Melt's original ASCII graph rather than adding
a separate tool-only filter.

## Controls

- Character size and cell width set the authored grid. Glyph size adjusts the ink
  inside a cell, independently of the grid. Ink weight changes coverage response.
- Characters accepts 1–64 UTF-16 units, with spaces, duplicates and order preserved.
  Supply characters from light to dense; repeated symbols weight their tone. This
  is an image/video treatment, not an editable plain-text export.
- Brightness, contrast and shadow detail shape the sampled source tones. Tonal
  steps quantizes the selection across the supplied ramp; distinct symbols remain
  limited by the characters in that ramp. Reverse density flips the selection.
- Image tones retains the source Color flag, including existing Color keyframes.
  Shaded ink uses luminance with the selected ink; Solid ink uses a constant ink.
  Both ink/tint and background are editable RGB colors. Source alpha is preserved.
- Advanced controls expose the finer parameters, including mix amount. The simple
  tool opens with a gentle tonal lift; the engine's neutral defaults preserve old
  documents. Reset returns to those engine defaults.

The character editor publishes bounded previews while typing, commits once on
Enter/blur and restores the canonical value on Escape, invalid input or owner
replacement. Text parameters use the generic definition/validation/control path
and are hold-interpolated in Motion. Shader uniforms carry scalars/colors; text
selects a resource and is never coerced into a numeric uniform.

## Resources and compatibility

Immutable atlases use 16 × 16 pixels per character, without mipmaps. A shared LRU
holds at most eight uploads (at most 512 KiB for 64-character ramps). Character
edits update texture/count bindings on the existing compiled pass. The projected
allocation accounts for incoming ramps and the cache's current high-water mark.
Eviction and disposal release textures explicitly; numeric and palette gestures
do not rasterize new glyphs. Gradient's ASCII treatment retains its original
fixed ramp and controls.

All new neutral defaults reproduce the original size, Color behavior, 16-glyph
selection and source alpha. Imported documents with no ASCII settings remain
valid. Newly authored settings remain portable, validated and undoable.

## Native verification

A serial, one-core, low-priority Chromium 156/Linux cohort compares the frozen
pre-enhancement graph with the current graph on both Three WebGPU and WebGL
backends, including colored/monochrome and semitransparent calibration pixels.
Both initial backend runs had zero differing bytes and zero alpha differences.
Custom palettes and glyph lists produced different decoded PNG pixels as expected.

The focused workload uses the 50 local JPEG fixtures (43 distinct originals),
resized natively to 128 × 96 source textures, with two effects per image. It draws
50 distinct character ramps, then replays the first after eviction. Each backend
retained two compiled materials, one scratch target and 159,744 owned scratch/atlas
bytes; replay was pixel-identical. Owned material, target and byte counts returned
to zero on disposal. Actual WebGPU, WebGL, Canvas2D and VideoFrame read APIs recorded
zero production readbacks. This is a focused ASCII resource/correctness witness,
not a full-editor latency benchmark. Raw browser/adapter availability, PNGs and
reports live in ignored `artifacts/ascii-native/`.
