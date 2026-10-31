# Bloom Windows

A 1920 × 1080, twelve-second Motion template with a natural-speed rose timelapse
and a fast 1.2-second orbit of editable dither, ASCII and cyanotype windows.

## Editing and interpolation

Open **Templates → Bloom Windows**. Ordinary parent/counter rotations keep each
card upright and its source image aligned with the unprocessed background. The
rig contains 26 keyframes in total: two linear rotation endpoints for each moving
part, including the separate label anchors. There are no sampled x/y trajectories
or generated points per video frame. Labels render above all cards; soft shadows
use dark backings rather than opaque white rectangles.

Each treatment processes only its 400 × 400 or 340 × 340 local surface. All four
video layers share one immutable original and one synchronized decode/upload.
Source-registration groups are oversized enough to cover their window throughout
the complete rotation. The source footage advances independently at its original
speed; geometry closes after ten complete turns. Source samples open and close
with mirrored frame order and identical decoded endpoints. This is authored
motion, not automatic object recognition.

Built-in Move, Focus/Blur, Grow and simple rotation presets already use two
control points per channel. Their evaluator interpolates arbitrary timestamps
without adding document keyframes. Multi-stage shakes, bounces and custom actions
can retain meaningful intermediate points. A regression checks bounded built-in
recipes and confirms that 240 evaluations never mutate their stored points.

## Source and reproducibility

Footage: [Video of Flower Blooming, Pixabay on Pexels](https://www.pexels.com/video/video-of-flower-blooming-855183/).
The [Pexels License](https://www.pexels.com/license/) permits modification and use
in templates. This asset is **not described as CC0**. The adjacent
`public/templates/motion/media/bloom-windows-source.json` retains its source URL,
license, original SHA-256 and the exact bundled loop fingerprint. Original source
bytes remain unchanged in the author's local artifacts; only the prepared loop
is bundled. The preparation includes no Melt effects.

With FFmpeg/OpenH264, generate the local loop from the pinned downloaded original:

```sh
ffmpeg -threads 1 -filter_complex_threads 1 -i rose-original.mp4 \
  -filter_complex '[0:v]trim=start=0:end=6,setpts=PTS-STARTPTS,fps=30,trim=end_frame=180,split[f][r];[r]reverse[rev];[f][rev]concat=n=2:v=1:a=0,format=yuv420p[v]' \
  -map '[v]' -an -c:v libopenh264 -threads 1 -b:v 4000k -g 30 \
  -movflags +faststart -map_metadata -1 encoded-loop.mp4
bun scripts/templates/bloom-loop.ts encoded-loop.mp4 bloom-windows-loop.mp4
```

Rebuild only this template through public engine commands:

```sh
bun scripts/templates/bloom-windows.ts
bun scripts/templates/render.ts --url http://127.0.0.1:6100 \
  --template bloom-windows --edge 1920 --time 3.5 \
  --output artifacts/bloom-windows/full
```

The normal gallery loader validates the portable document and the original's
exact SHA-256/byte length before atomic installation. The bundle's `.musart`
metadata needs its video sidecar, as do the existing original-backed templates.
The poster comes from an inspected native rendered frame.

Hover uses a separately verified 480 × 270 derivative of the **raw flower video**.
Its manifest retains the same live effects, text and Motion data. The loader and
source cache keep preview/full variants separate; opening and saving always use
the full 1080p original. Decoder and GPU uploads share one immutable same-PTS
frame across synchronized copies. Different trims/proxies retain separate frames.

## Rendering and verification

Hover uses a separately validated 480 × 270 derivative of the raw footage. It
retains live native effects; normal project installation resolves the full 1080p
original. Saved projects retain their authored document, so the new rig is applied
by reopening the template rather than overwriting a user's existing composition.

Playing compositions use a bounded front/back pair. The displayed texture stays
untouched while its successor is composed; publication waits for real GPU queue
acknowledgement and rejects cancellation before swapping the accepted output.
This fence reads no GPU pixels.

Playback no longer resizes the browser framebuffer or republishes Fiber's DPR
when dimensions/density are unchanged. Moving transport groups reuse one cropped
allocation per layer/density, with crop bounds included in the content signature.
Surfaces no larger than four million pixels keep their full target when at least
half is visible; this trades bounded overdraw for stable allocations during motion.
Tiny windows inside large containers still use their original cropped texel grid.

The infinite-canvas clock holds during pending frame preparation and releases at
actual display presentation. Normal preparation receives up to 33.3 ms of elapsed
time credit, while long decode/compile stalls do not accumulate catch-up time.
This does not change authored timestamps or offline export cadence.

The native opacity witness freezes the source image and inspects all three window
interiors at 25 phases over one full orbit, independently on WebGPU and WebGL. It
requires fully opaque coverage, catching local holes even when the rest of the
canvas remains visible. Separate native checks compare source registration,
first/last/terminal loop poses and a decoded twelve-second MP4. Inspection image
reads stay outside production pixel-read accounting. Evidence stays in ignored
`artifacts/bloom-flicker/`.

The final production cohort passed all six focused browser checks: infinite-canvas
playback, gallery hover, both backend coverage witnesses, and both backend loop
witnesses including an encoded MP4. The displayed source strip stayed visible in
all eight post-cadence captures per UI surface. Hover presented 97 updates in
3.2 seconds (p95 38.5 ms) with zero drawing-buffer resize writes. The cold canvas
interval presented 41 updates with p95 433 ms; the largest authored-clock step
was 49.9 ms. These two-core measurements do not establish universal 60 fps.

The wider 50-image production workload verified initial effect pixels, gestures,
transparent/canonical encoding, IndexedDB recovery frames and original integrity
checks. Its final recovered-PNG stage timed out and the process was stopped
when its isolated browser group exceeded its
2500 MiB MemoryHigh threshold (3000 MiB hard limit), rather than continuing under
heavy memory reclaim. Its complete gate is not counted as passing. Earlier dev
runs were unsuitable because the isolated Vite server also hit MemoryHigh and
stalled module requests. Production verification used a frozen application and a
bundle of the same native SDK, avoiding dev transformation overhead. The native
wheel setup helper now settles each bounded packet, preserving its exact zoom
assertion without violating the editor's bounded lookahead policy.
