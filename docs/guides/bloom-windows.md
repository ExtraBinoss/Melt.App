# Bloom Windows

A 1920 × 1080, twelve-second Motion template with a real rose timelapse and three
moving treatment windows. Its 60 fps composition animates the windows over one
30 fps original. Dither, ASCII and cyanotype are ordinary editable GPU effects;
bare labels and drop shadows are ordinary document layers.

## Editing

Open **Templates → Bloom Windows**. Each effect belongs to its named window
group. Its full-size video child counter-translates against the window so the
underlying petals remain aligned with the unprocessed background. The effect
only processes the group's 400 × 400 or 340 × 340 surface. This avoids retaining
three full-HD effect/mask/reference stacks. The 13-layer document uses direct
group bounds for cropping, without extra transport groups, mask layers or outlines.
All four video layers share one
immutable original, and every video track is silent.

The cropped group, shadow and bare label follow a continuous 1.2-second carousel.
The source video plays at its original speed, independently of that faster cycle.
There are no white flash layers or opacity/enable toggles. The final
geometry matches the first exactly. The source footage opens and closes with
natural-speed opening and mirrored frame order. Its final six samples reuse
the first AVC key packet, producing identical decoded source endpoints. This is authored motion around
the flower, not automatic object recognition or a new tracking subsystem.

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

## Verification

Focused tests cover command replay, deterministic generation, normal gallery
installation routing, shared source identity, counter-translation, label/window
alignment, silent tracks and closed geometry paths. The native browser witness
renders both backends, compares source-only pixels outside the effect windows,
checks first/last/terminal loop frames, and decodes an actual twelve-second MP4.
Production pixel-read APIs are instrumented separately from inspection images.
Evidence stays in ignored `artifacts/bloom-windows/`.

The infinite-canvas transport holds its presentation clock while a frame is pending.
Normal preparation receives up to one 30 fps frame of elapsed-time credit; longer
cold decode/shader waits do not accumulate unseen animation time. Presentation,
seek, failure and disposal release their leases. Audio buffering retains its
existing independent lease. This can slow preview on overloaded devices rather
than skipping ahead to recover real time; it does not change authored timestamps
or offline export cadence.

The final production browser cohort (Linux 7.2.8, Playwright Chromium, WebGPU,
1600 × 1000 viewport, one browser worker capped at two logical CPU cores and
2400 MiB) observed 62 actual canvas presentation updates in 3.2 seconds
(p95 gap 52.2 ms), with one decoder/upload stream and no production pixel
readbacks. The largest presented clock increment was 50.1 ms. Hover presented
97 updates in 3.2 seconds (p95 gap 42.3 ms), using only the raw 480p derivative.
These are bounded host measurements, not a guarantee of 60 fps on every device.
A separate cold development run retained a 2.2-second preparation pause; buffering
kept that pause out of the animation clock. The matching production canvas gate
passed. Native WebGPU/WebGL output, source registration, exact loop endpoints and
a decoded twelve-second MP4 passed independently. A native display screencast of
142 frames showed no return to a white canvas after the composition appeared.
