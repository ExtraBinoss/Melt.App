# Effect catalog previews

`catalog.webp` contains 45 static previews rendered by Melt's production Three.js
TSL effect graph. Studio and Classic share the atlas; displaying an effect menu
does not create a GPU renderer or evaluate an effect.

Regenerate with a development server on port 6100:

```sh
bun scripts/effects/render-catalog.ts
```

`EFFECT_PREVIEW_URL` and `CHROME_PATH` can select another local server and Chrome
installation. The script renders the catalog sequentially in one bounded session,
disposes its resources, and records readback checks in the ignored
`artifacts/effect-catalog/atlas-report.json`. Every eligible catalog entry has its
own native export. Explicit representative settings show brush, reveal and motion
effects at a useful authored state; adjustments use visible amounts. These are
examples rather than live previews of the selected document.

The source photograph is the existing local boathouse fixture,
`/benchmark/06-boathouse-1.jpg`, by Luca Bravo (Unsplash). Its source and license
are recorded in [the benchmark credits](../benchmark/ATTRIBUTION.md) and
[manifest](../benchmark/manifest.json). The letter and circle are native layers.
