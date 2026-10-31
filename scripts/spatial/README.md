# Native 3D material previews

Run the editor first, then bake the picker atlas with:

```sh
bun scripts/spatial/render-materials.ts
```

Set `SPATIAL_PREVIEW_URL` and `CHROME_PATH` when needed. The script renders all
30 presets through Melt's actual Three WebGPU graph and PNG exporter, using
the same studio environment and camera. Five columns by six rows, 200 px per
tile. The picker reuses this static atlas and does not create preview renderers.
The generated image is an original Melt asset.

## Object library

`bun scripts/spatial/render-library.ts` renders the 37 real shape/model previews
into `apps/web/public/spatial/library.webp` using one bounded native session.
It records GPU cache accounting and zero-readback instrumentation under ignored
`artifacts/spatial-library/`. The running editor supplies Vite modules; override
`SPATIAL_PREVIEW_URL` and `CHROME_PATH` when needed.

`bun scripts/spatial/bundle-kenney.ts` reproduces the sixteen CC0 models from the
pinned original archives in `artifacts/cornell/kenney-{prototype,nature}.zip`.
Archive URLs and SHA-256 hashes are in the script and source ledger. It embeds
original PNG palettes without changing geometry/materials, retains both licenses
and writes `packages/assets/data/spatial/models.json`.
