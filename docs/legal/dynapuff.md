# DynaPuff font provenance

Melt Mascot uses the locally bundled DynaPuff variable TrueType face, designed by
Toshi Omagari and the DynaPuff Project Authors. The playful rounded outlines are
real font contours used by the native Inflate/morph renderer and editable text.

- Official repository: <https://github.com/googlefonts/dynapuff>.
- Pinned upstream revision: `0cc624ef50b654ffe1a30785396aaba308406132`.
- Original file: [`fonts/variable/DynaPuff[wdth,wght].ttf`](https://github.com/googlefonts/dynapuff/blob/0cc624ef50b654ffe1a30785396aaba308406132/fonts/variable/DynaPuff%5Bwdth%2Cwght%5D.ttf).
- Bundled unchanged as `apps/web/public/fonts/dynapuff/font.ttf` (212,600 bytes).
- SHA-256: `c3752fc6dd8aaa46a88637f061a9a4e6ab44c02c5f0afd65528b91ae8ff6f948`.
- SIL Open Font License 1.1: the complete upstream notice and authors are retained
  in `apps/web/public/fonts/dynapuff/OFL.txt` and `AUTHORS.txt`.

The shipped face's weight axis supports 400–700; its width axis supports 75–100,
with default width 100. Melt Mascot authors weight 700 at the default width. Both
its editable text and morph source metadata name DynaPuff at that same weight.
The generator derives four letter outlines from these local bytes and preserves
the existing 67 contour poses and full-height movement. The animation remains
one native action with four semantic progress points.

`FONT_CATALOG` registers this face as `dynapuff`. Editor font preparation and the
standalone renderer both resolve it to the app's local `/fonts/dynapuff/font.ttf`
asset, including when preparing exports. No CDN or remote font catalog is needed
for this template. The local font manifest preserves its pinned source URL,
license location, file size and checksum. Installed original font bytes also
survive editor reopening through the existing font store.
