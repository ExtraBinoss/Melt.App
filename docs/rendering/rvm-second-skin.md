# Second Skin RVM diagnosis

## Reproduction

The real Second Skin source is
`apps/web/public/templates/motion/second-skin/media/second-skin-dancer.mp4`:
720 × 1280, 250 frames, 25 fps, ten seconds. Preparation produces RGB NCHW input
at 288 × 512, normalized to 0–1, with FP16 source/recurrent tensors and FP32
`downsample_ratio = 1`. Four recurrent states are initialized to zero, then passed
between sequential frames. The pinned 7,503,483-byte model and SHA-256 are recorded
in `VIDEO_BACKGROUND_MODEL`; no substitute or synthetic inference was used.

On November 5, 2026, Chromium 156 with Intel Xe LPG WebGPU and ONNX Runtime Web
1.31.1 reproduced a nearly black matte before encoding or compositing. Across the
first eight frames the maximum alpha fell from approximately 0.49 to 0.15, with
no pixel above 0.8. This was separate from the previously corrected native
Float16Array decoding bug.

## Isolation and fix

CPU ONNX Runtime 1.31.1 inference of the identical FP16 graph and source produced
a recognizable person matte: first-frame mean alpha about 0.242, with 33,971 of
147,456 pixels above 0.8. The source's low exposure does not explain the failure.

Three independent WebGPU first-frame sessions isolated the layout path:

| Session option                               | Mean alpha | Pixels above 0.8 |
| -------------------------------------------- | ---------: | ---------------: |
| Explicit `preferredLayout: "NCHW"`           |    0.24180 |           33,986 |
| Default layout, fetch every output           |    0.00739 |                0 |
| Default layout, graph optimizations disabled |    0.00703 |                0 |

The production RVM session now explicitly chooses NCHW. This establishes a
layout-dependent numerical failure in the default WebGPU execution path; it does
not identify a particular upstream kernel. Shared model runtime options remain
unchanged. Only alpha crosses to CPU for native mask encoding; recurrent tensors
stay on GPU. No thresholds, exposure changes or artificial alpha amplification
are applied.

## Verification

Run `bun scripts/verify-video-matte.ts` against the Vite server on port 6100.
`MUSART_BASE_URL` overrides the server. `MUSART_RVM_MODEL` optionally supplies
locally downloaded pinned weights through the real hash-validating downloader.

The verifier processes all 250 source frames through `removeVideoBackground`,
decodes the resulting video at 0, 0.28, 2, 5 and 9.96 seconds, and requires opaque
foreground, background and soft edges at every checkpoint. It applies that video
as a luminance mask through the production renderer and inspects the alpha of
transparent native PNG exports on WebGPU and WebGL. It checks actual backend
identity rather than accepting a silent fallback. Reports and captures are written
to ignored `artifacts/rvm-second-skin-verification/`.

The complete real-source check passed on Chromium 156.0.8078.4, Linux
7.2.13-200.fc44.x86_64, Intel Xe LPG hardware (not a fallback adapter), under a
200% CPU / 3.5 GB process scope. The encoded MP4 matte is 1,457,739 bytes and all
five checkpoints pass. At time zero the decoded mask has 34,013 foreground,
108,458 background and 4,985 intermediate pixels. The transparent exports on both
verified backends retain 34,013 foreground pixels and over 108,000 background
pixels, with matching alpha distributions. Native decoded PNGs were also inspected
visually over a checkerboard. Ten focused tests covering recurrent ownership,
half-float interpretation, atomic publication, undo and source-clock masks pass.
Focused lint/format checks and `bun run check:rules` also pass. The repository-wide
typecheck still reports unrelated diagnostics in role-query tests, fetch mocks,
the effect catalog test data and background-rendering helpers; it reports none in
the changed RVM files. Its log is retained in
`artifacts/rvm-second-skin/typecheck.log`.

These are functional checks against Vite on a bounded workstation, not a
production throughput benchmark or a quality guarantee for every subject. The
source is intentionally dark. To inspect transparency in the editor, regenerate
the old mask and use a transparent or contrasting composition background; the
Second Skin template's dark background and thermal/edge effects are separate
from RVM's person matte.
