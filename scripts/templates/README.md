# Template generation

Each current template owns its generator and specific preparation helpers:

```sh
bun scripts/templates/studio-starter/generate.ts
bun scripts/templates/second-skin/generate.ts
bun scripts/templates/terminal-signal/generate.ts
bun scripts/templates/angel-windows/generate.ts
bun scripts/templates/cornell-box/generate.ts
bun scripts/templates/bloom-windows/generate.ts
bun scripts/templates/morphing-type/generate.ts
bun scripts/templates/share-your-work/generate.ts
```

The static Studio starter lives under `public/templates/designed/studio-starter/`
and uses the existing bounded designed-template loader. Its editable sources are
core-native text extrusion and primitives, with no external media dependencies.

Motion outputs live in `apps/web/public/templates/motion/<id>/`: `<id>.json` is the
validated gallery bundle, `<id>.musart` is portable metadata, and
`<id>.commands.json` records replayable public command batches. Template-specific
builders live in `apps/web/src/services/projects/templates/motion/<id>/`.

`generate.ts` regenerates retired internal workloads; `designed.ts` regenerates
the Studio starter and the retired designed workloads, keeping
one output directory per ID. Their existence does not add a gallery entry.
`media.ts` prepares shared licensed media and original audio. Existing original
files, hashes, attribution and license records remain in `motion/media/`.
FFprobe is required for source-backed media metadata and tests.

`render.ts` renders real GPU covers from `<input>/<id>/<id>.json`; use it against
an existing isolated editor server and inspect the image before copying it into
the owning template directory. It does not create substitute SVG posters or
establish a playback frame-time budget. See
[editable templates](../../docs/guides/motion-templates.md) and the
[performance protocol](../../docs/performance/protocol.md).
