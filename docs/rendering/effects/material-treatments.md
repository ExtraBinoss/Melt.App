# Material treatments and image inputs

Bevel & Emboss, Displace and Thermal are ordinary GPU effects. They use the same
validated document metadata, parameter preview/commit path, Motion property
registry and Three.js TSL compositor as other effects. They accept the rendered
source of images, shapes, text, groups, video and native 3D layers. There are no
new templates or per-source implementations.

## Appearance and controls

- **Bevel & Emboss** derives a screen-space normal from alpha or luminance with a
  fixed eight-neighbor height kernel. Size, softness, depth, raised/recessed
  direction, light azimuth/elevation, ambient light, highlight/shadow strengths,
  gloss and highlight/shadow colors are editable. It is an image treatment,
  not additional mesh geometry or scene lighting.
- **Displace** uses a named image input, or a deterministic procedural field when
  no map is assigned. Controls include independent signed X/Y pixel strengths,
  map scale/rotation/offset, midpoint, contrast, channel selection, repeat/mirror/
  clamp addressing, dispersion and time/speed. Displacement moves color and coverage together using premultiplied sampling,
  with conservative GPU transport margins for displaced silhouettes. Preserve alpha
  optionally clips the treatment to the original silhouette. Map coordinates stay
  anchored to original content when the transport rectangle expands.
- **Thermal** maps visible luminance through Iron, Rainbow, Ice or Monochrome
  palettes. Range, gain, gamma, saturation, direction, banding, edges, grain,
  scanlines and time/speed are editable. This is an artistic heatmap, not a
  measurement of physical temperature.

Bevel and Thermal retain source alpha; Displace can move it or preserve it explicitly.
Amount zero retains the original appearance through a shared identity capability
used by primitive admission, reference rendering and source preparation. Explicit
blend/compositing overrides keep their normal behavior. Numeric settings
and amount use existing sparse Motion keyframes; playback creates no document
keys. Reusable Motion recipes omit project-only image references: choose a map
from the texture library in the destination project.

## Portable image inputs

Effect definitions declare named image slots. Core validates every slot and owned
image reference. Copy/paste remaps those references and includes their originals;
selection export reserves their IDs. Render preparation uploads maps through the
existing bounded image cache. Cache keys include input-original identity, so
replacing an original cannot reuse stale pixels. GPU passes bind shared textures
and stable enabled uniforms; compilation uses a neutral placeholder before source
preparation. Missing assigned images fail rather than silently switching maps.

The texture picker uses a nonmodal popover, animated shared segmented control and
scroll shadows. Bundled originals load only on selection, with exact size/hash
checks; the initial grid loads small previews. The three bundled maps are CC0
Poly Haven assets; see [the source ledger](../../../apps/web/public/textures/sources.json)
and [license notice](../../../apps/web/public/textures/LICENSE.md).

Imported PNG/JPEG/WebP files enter a global browser library. Limits are 128 items,
8 MiB per original, 4096 pixels per axis and 64 MiB total. Listing reads bounded
metadata and 96-pixel previews, not original images. SHA-256 IDs deduplicate
imports. Selecting a map embeds an independent original in the project and
updates the slot in one validated transaction and undo entry. Deleting a global
texture leaves existing projects intact. A durable generation barrier rejects
imports that finish after a concurrent deletion. Aborted operations and stale
project/selection results cannot publish document changes.

## Verification

Focused native Chromium tests decode rendered PNGs on a separate inspection page.
All three effects change actual RGB output on image and native 3D sources through
WebGPU, and on image, native 3D and decoded video through Three's WebGL fallback.
The image and 3D witnesses sample real two-point Motion amount channels. Bevel, Thermal and the optional alpha-preserving Displace retain source alpha;
the normal Displace witness must move actual coverage. Flat-color ellipse sources
verify that the treatment also deforms shapes.
Production GPU, WebGL and Canvas pixel-read probes all remained zero.

A 50-image Displace workload with one shared map uploaded two source textures,
retained 56 cache entries and charged 11,437,704 bytes under a 64 MiB budget.
This checks bounded reuse, not a frame-rate claim. The native texture-picker test
imports a real PNG, applies it in two projects, verifies single-entry undo and
proves global deletion preserves the second project's embedded original. It also
covers React StrictMode mount/cleanup replay. Captures and reports are ignored
under `artifacts/material-effects/`; checks ran serially with a one-core CPU quota,
low priority and explicit memory limits on the development server at port 6100.
