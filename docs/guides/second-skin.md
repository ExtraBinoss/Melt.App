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

The gallery card plays a 270 × 480, 25 fps encoded native render (352,205 bytes),
so touch autoplay does not load Three.js, the document or a video decoder worker.
The clip contains the actual Thermal/Scharr treatments and typography. Its source
revision, manifest hash and encoded digest are retained in `second-skin.card.json`;
`MOTION_TEMPLATE_CARD_CLIPS` rejects stale clips after a template revision changes.

The larger preview dialog still uses the live GPU graph, with a separate untreated
270 × 480 derivative (227,350 bytes) and unchanged document layers/Motion. It has
a distinct original ID, digest and cache variant, so opening the template always
installs the full source. Its encoding command is recorded with the provenance.

The video is by cottonbro studio via Pexels and remains under the Pexels License,
not the repository code license or CC0. Original and derivative fingerprints,
source URLs, license links and the exact preparation command are retained in
`apps/web/public/templates/motion/second-skin/media/second-skin-source.json`.
The combined template includes authored typography and editable treatments; the
stock source is not offered as a standalone stock-media product.

```sh
bun scripts/templates/second-skin/generate.ts
bun scripts/templates/render-card-clip.ts second-skin http://127.0.0.1:6100
bun scripts/templates/render.ts --url http://127.0.0.1:6100 \
  --template second-skin --time 3 --edge 720 \
  --output artifacts/second-skin-cover
```

After changing the document, regenerate the card clip and update its source/clip
revisions together. The generic clip renderer evaluates exact 25 fps frames through
the native engine and browser canvas encoder, then uses one FFmpeg encoder thread.
Frames are written under ignored `artifacts/template-clips`, never into the project.

The poster comes from the actual Thermal-stage GPU render. Gallery source and
poster URLs use its final revision. Each original path is validated as shared
`media/<file>` or owned `<template-id>/media/<file>`; another template's folder,
traversal and remote URLs are rejected.
