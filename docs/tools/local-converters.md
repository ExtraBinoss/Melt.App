# Local effect converters

Melt exposes six public, prerendered converters under `/tools`: ASCII, monochrome/source-color
Dither, Halftone, Cyanotype, CRT and Posterize. Each page accepts images and videos
and selects the appropriate controls and encoder from the chosen file. Former
media-specific URLs redirect permanently to the shared effect page. The
catalog in `apps/web/src/tools/catalog.ts` is shared by routes, footer links and
prerender configuration. Each page contains its own effect explanation, practical
tips, output limits and frequently asked questions. Canonical URLs and the sitemap
use `https://melt.plinka.eu`. Search placement is not guaranteed.

## Runtime boundaries

The server renders the page, guide, FAQ answers and upload surface. Choosing a
supported local file loads the workspace; that workspace dynamically imports the
existing Melt renderer. Public pages do not mount React Three Fiber or download
its editor canvas. The converter uses the same retained Three.js/TSL render
session, effect registry and native export pipeline as the studio, including
Three's WebGL fallback. Registry-driven controls expose a concise subset first;
Advanced reveals the remaining existing parameters.

`ToolDocument` owns one validated engine document. Property drafts are imperative
renderer requests; a completed control gesture commits one command. Resizing and
video trims use atomic engine transactions. A single renderer session retains
its resources, admits one frame at a time and coalesces later requests. Optional
playback pauses outside the viewport, in hidden tabs, during UI presentations and
while controls have an active draft. Transport and export progress have separate
subscriptions, so animation frames do not rerender the controls.

## Bounds and cleanup

- Reject unsupported/empty inputs before reading them or importing the renderer.
  Raster inputs are limited to 50 MiB, sanitized SVG to 256 KiB and video files to
  512 MiB. Video codec/track support is probed rather than inferred from a suffix.
- Native image preparation caps source textures to a 1920-pixel long edge. Output
  sizes are 720, 1280 or 1920 on the long edge, preserving aspect ratio and never
  upscaling. GPU previews have a 768-pixel long edge.
- Video exports contain at most 60 seconds / 1800 frames at 30 fps. Source audio
  can be kept or muted; preview monitoring starts muted and can be enabled through the shared player. The initial rational source duration
  is preserved and a rounded trim is clamped against the actual remaining span.
- GPU sessions are capped at 192 MiB; encoded video output at 128 MiB. Source
  video decoding retains the existing renderer's bounded original-frame cache.
- A new file aborts source preparation and export, drops intermediate queued
  files and waits for the old session to dispose before creating the next one.
  Generation checks reject late frames, status callbacks and downloads.
- Navigation disposes RAF, visibility/IntersectionObserver subscriptions, pending
  source/export work, frame sessions, temporary download URLs and DOM canvases.
- Image output uses native canvas encoding; video output uses the existing native
  encoder. Production code never reads GPU pixels into JavaScript.

The common mascot throbber spans module loading, media preparation, first GPU
frame and export. Its presentation delay suppresses flashes without delaying the
operation. First-frame readiness dismisses the overlay. Failures are visible and
retryable; cancellation does not report a successful export. Development-only
`[Melt perf]` spans retain the existing `import.meta.env.DEV` gate.

## Verification

Focused model/controller tests cover schema validation, one-entry undo, atomic
trims, rational endpoints, stale-source rejection, serialized disposal and cancelled
obsolete exports. Native browser cases cover all six real image effects, decoded
WebP output and actual readback API instrumentation, plus moving video output,
trimmed timestamps, retained/muted audio and bounded decoder/frame resources.
Browser inspection reads decoded files on a separate uninstrumented page; these
validation reads are not part of production rendering.

Preview cards are derived from actual Melt exports of the existing Luca Bravo
boathouse fixture. See the public preview attribution for the source and license.

The sample chooser offers Image and Video before loading the renderer. The image
reuses the boathouse fixture; the video reuses the locally hosted MDN CC0 flower
clip, with provenance in `apps/web/public/templates/motion/media/sources.json`.
Sample requests are abortable and reject stale responses. Output dimensions live
inside the download button for both media types.

## Live effect controls

The foreground tool preview uses the engine's sequential playback cursor while
playing and its still-preview path while paused. Exact source frames remain an
export concern. Numeric/text/color drafts no longer freeze the transport clock or
yield to an unrelated menu entrance lease. Hidden/offscreen views and exports
still suspend playback work.

A retained session admits one in-flight frame and coalesces the next draft.
Updates inside one gesture may finish in order while a newer draft is queued;
commit, cancellation and source disposal invalidate that gesture's pending frame.
This avoids starving presentation when pointer input arrives faster than rendering.
The engine's decoded-frame and GPU budgets remain in force.

Basic controls remain visible. Advanced controls follow them as the last disclosure
in the parameter list and expand downward with an animated height; the output,
transport and download controls move naturally with the list. Reduced-motion
preferences skip that animation. The video player shares the trim fields’ horizontal
bounds without an extra padded panel. Keep audio appears only for sources with an
audio track.

Dither starts with its original black-and-white ink/paper palette. Source colors
switches the same one-bit effect to independent RGB-channel thresholding (up to
eight colors), keeping all five existing pattern methods. Ink and paper controls
are hidden in source-color mode. The validated `sourceColor` setting defaults to
false for existing portable documents. Preview, image download and video export
use the same retained TSL graph; neither mode reads GPU pixels into JavaScript.
