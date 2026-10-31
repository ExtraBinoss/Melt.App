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
