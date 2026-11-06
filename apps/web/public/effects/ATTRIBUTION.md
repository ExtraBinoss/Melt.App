# Effect catalog previews

`catalog-9c8918b0b40bb53a4a2e3248.webp` contains 59 static 240 × 180 thumbnails baked with Melt's production Three.js TSL renderer. Classic and Studio load this atlas; browsing never creates an effect renderer or reads source photographs.

Regenerate with the development server running:

```sh
bun scripts/effects/render-catalog.ts
```

The four photographic originals in [sources/](sources/) were generated specifically for Melt; [generation prompts and provider records](sources/GENERATION.json) and the [source manifest](sources/manifest.json) are bundled alongside them. No external photographer or stock service supplied these originals. The SDK's typed `preview` declarations select the photograph, native scene and representative effect values. Each active effect, including adjustments and geometry morph, is baked once. Depth of Field uses real native depth; Trail samples sparse authored Motion poses. Unsupported or failed scenes stop publication and retain the previous atlas.

The Displace input is the bundled Poly Haven **Grey Plaster** CC0-1.0 normal map; see [texture licenses](../textures/LICENSE.md). Source dimensions, hashes, exact authored documents, native frame statistics and zero-production-readback results are recorded in the atlas metadata and ignored `artifacts/effect-catalog/atlas-report.json`. `EFFECT_PREVIEW_URL` and `CHROME_PATH` select a local server and Chrome installation. One bounded render session processes scenes serially and is disposed after baking.

| Original | SHA-256 | Bytes |
| --- | --- | ---: |
| `apps/web/public/effects/sources/editorial-portrait.webp` | `46700c03af1542a6d05f86926faa4c962b9fee2069cf87e021ca45a0855adc79` | 78178 |
| `apps/web/public/effects/sources/alpine-lake.webp` | `cbc6b89ca4ae37c3662f36e21c5c74e3941279b96ea14e4ca08bb2f81a4cde20` | 265352 |
| `apps/web/public/effects/sources/studio-still-life.webp` | `17d7ad8a670adacbb10c07bd1280fd9aff636a5093f8b6725a3b63b0b1c18e77` | 68948 |
| `apps/web/public/effects/sources/neon-city.webp` | `2ceb698cab4dfc5fe415c4794729f6d6bffb217d95f348b0a8fbede7dff86810` | 220334 |
| `apps/web/public/textures/normal.png` | `7ffd1ed71c202566e3af93c7c4f4a2f0031ddffb9fd22fb8a282e82fe84aeea2` | 1237291 |
