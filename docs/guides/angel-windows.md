# Angel.exe template

Angel.exe is an editable native Melt Motion template in **Templates**, at 1080 × 1920, 30 fps and 12.8 seconds (384 frames). It follows the supplied portrait reference: an electric-blue ASCII desktop, a rotating angel and three moving desktop-window ribbons. It uses the normal project loader, validated commands, renderer, hover preview and export pipeline.

## Editable structure

- One GLB angel inside a full-page group. Change the model's rotation, pose, material and light through the normal editor controls.
- One **Window trails** effect on that group. Its three ribbons sample the same current source texture: original shaded geometry, edges/grid and X-ray-style tones. An optional SVG atlas supplies the window titles, controls and crop marks.
- Separate menu, menu surface and attribution text layers.
- Nine authored control points: two for Y rotation, five for Z tilt and two for the effect clock. Playback never writes document keyframes. The delayed window positions are evaluated from exact composition time; seeking backward does not replay a history buffer.

Window trails is also a reusable library effect. Its controls cover the window count (1–32 per ribbon, at most three ribbons), delay, speed, phase, travel, figure-eight/orbit/sweep path, dimensions, colors, shadows, source framing and optional ASCII background. `screen` framing preserves source registration while the windows move; `fit` repeats the complete current source within each window. `amount = 0` preserves the source. Treatments and frame artwork run through TSL on GPU textures, with Three's WebGL fallback; there is no production GPU pixel readback.

The raw 3D source is rendered once, not once per window. The effect searches windows front to back and samples source pixels only at the first covering window. Source frames, shader programs and glyph/frame atlases are reused. The effect is stateless: the same time and document produce the same result regardless of the previous seek.

The reusable effect now prepares its bounded window rectangles once per pose, rather than repeating path trigonometry for each fragment. Source pixels and treatments stay on GPU textures. See [the overlay and geometry investigation](../performance/angel-overlays.md) for measurements, native checks and limitations.

## Source and attribution

The replacement model is **Engel** by **noe-3d.at**, with LOD preparation by **M. K. Turkcan**, distributed in [Valdrada](https://huggingface.co/datasets/mehmetkeremturkcan/valdrada/blob/main/LICENSE.md) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The [source GLB](https://huggingface.co/datasets/mehmetkeremturkcan/valdrada/resolve/main/Content/models/cp33/bethesda/angel.glb) contains three LODs. Melt keeps the supplied 18,733-triangle LOD2, removes unused LODs, texture and UV data, and packs indices into 16 bits. Positions and normals are preserved; the resulting self-contained model is 586,712 bytes. Source URLs, license, authors, modifications and SHA-256 are retained in the GLB and `media/angel-source.json`. Attribution is also an editable template layer; retain the credit when redistributing the model or rendered output.

The first low-poly candidate was replaced by this more detailed scan. Stanford Lucy and other models with different distribution terms are not bundled.

## Rebuild

The pinned prepared GLB is bundled locally. No external request is needed to open the template.

```sh
bun scripts/templates/angel-windows.ts
```

To repeat source preparation, download the original linked above and pass its bytes through `prepareAngel` in `scripts/templates/angel-source.ts`, writing the result to `apps/web/public/templates/motion/media/angel-source.glb`, then regenerate the bundle. The generator emits a normal manifest, portable `.musart` and replayable command journal. The original source digest is embedded in the prepared GLB.

## Verification and limits

The focused browser witness is `test/browser/window-trails.spec.ts`. It checks native WebGPU and WebGL renders, nonsequential exact seeks, amount-zero pixel identity, changed treatment pixels, one shared 3D source, explicit disposal and a bounded 50-image effect workload. Readback probes instrument actual WebGPU buffer, WebGL pixel, Canvas2D pixel and VideoFrame copy APIs; inspection pixels are decoded in a separate page. Captures and reports belong in ignored `artifacts/angel-windows/`.

Set `MELT_TEMPLATE_VIDEO=1` for a native full-resolution MP4 export in the WebGPU case. It uses the actual editable graph, not the reference video. The reference soundtrack is not bundled.

The user approved a similar replacement angel. This is a reconstruction of the visual treatment, not a pixel-identical copy of the original sculpture or hand-tracked window trajectories. The edge/grid treatment is image-space contour processing, not a second triangular wireframe model render; the X-ray treatment is a tone rendering, not volumetric geometry. The entrance/reset follows the reference rather than claiming a seamless end-to-start loop. Large window counts and full-resolution source effects still have a finite GPU cost.

### Native verification (2026-11-01)

Measured feature source: `a85c2dc` (before merging the independent Time Warp Scan update). The native backend and 50-image witnesses also passed after that integration.

Development server, Headless Chrome 156 on Linux x86_64, DPR 1; available WebGPU adapter Intel Xe-LPG. Checks ran serially under CPUQuota=200%, MemoryHigh=2200 MiB, MemoryMax=3000 MiB and no swap, with low process/I/O priority. This is a bounded functional cohort, not a production performance benchmark.

| Check                                                             |              WebGPU |               WebGL |
| ----------------------------------------------------------------- | ------------------: | ------------------: |
| Warm host preparation, median / p95 (60 frames, 405 × 720 output) |      3.75 / 17.9 ms |      2.95 / 15.6 ms |
| Exact 4s seek after visiting 12s, maximum channel difference      |                   0 |                   0 |
| Amount-zero identity, maximum channel difference                  |                   0 |                   0 |
| Shared spatial sources / meshes                                   |               1 / 1 |               1 / 1 |
| Retained template cache                                           |    92,899,024 bytes |    92,899,024 bytes |
| 50-image workload cache / uploads (one shared original)           | 3,866,564 bytes / 1 | 3,866,564 bytes / 1 |
| Instrumented production readbacks (all four API families)         |                   0 |                   0 |

A real native MP4 export was decoded and inspected: **1080 × 1920, 30/1 fps, 384 frames, 12.800 seconds**. Both backend witnesses and the 50-image cases passed. Host preparation timings measure work until draw submission returns; they are not GPU duration or certified displayed frame rate. Optional MP4 encoding is excluded from the warm preparation samples.

Focused document, parameter, translation, loader, template-journal and deterministic authoring regressions accompany the browser witness. Full-app coverage/build sweeps are intentionally outside this feature's local validation scope.

Strict TypeScript checking for the changed feature and its dependency graph passed, as did focused lint and repository rules (zero violations). A repository-wide TypeScript attempt exceeded the chosen 1536 MiB V8 heap limit and is not counted as a passing check; it was replaced by the scoped strict check rather than increasing workstation load.
