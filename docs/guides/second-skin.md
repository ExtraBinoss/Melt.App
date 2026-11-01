# Second Skin

An editable 1080 × 1920, ten-second fashion study. One dancer original moves from
natural photography to an iron Thermal palette, then a Scharr contour treatment,
before returning to the original. The title consists of two editable text layers.

The document uses two native Motion blocks with twenty semantic control points:
twelve for the two effect amounts and eight for the shared title's opacity/y
reveal. There are no sampled document keys, duplicated video layers or baked
visual treatments. Playback and export use the same GPU effect graph.

The original clip is a locally bundled 720 × 1280, 25 fps, silent ten-second loop.
Forward source frames 0–125 are followed by 124–1. The reversal and wrap step to
adjacent source frames instead of duplicating their endpoints. The document
frame rate is 50 fps; video copies are unnecessary. The original and manifest
retain content hashes, sizes and exact timing, and install through the ordinary
bounded atomic media service.

The video is by cottonbro studio via Pexels and remains under the Pexels License,
not the repository code license or CC0. Original and derivative fingerprints,
source URLs, license links and the exact preparation command are retained in
`apps/web/public/templates/motion/second-skin/media/second-skin-source.json`.
The combined template includes authored typography and editable treatments; the
stock source is not offered as a standalone stock-media product.

```sh
bun scripts/templates/second-skin/generate.ts
bun scripts/templates/render.ts --url http://127.0.0.1:6100 \
  --template second-skin --time 3 --edge 720 \
  --output artifacts/second-skin-cover
```

The poster comes from the actual Thermal-stage GPU render. Gallery source and
poster URLs use its final revision. Each original path is validated as shared
`media/<file>` or owned `<template-id>/media/<file>`; another template's folder,
traversal and remote URLs are rejected.
