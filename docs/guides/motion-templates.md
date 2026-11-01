# Editable Motion templates

Every gallery card installs an independent saved project through the shared
validated installation service. Templates remain fully editable documents.

| Template         | Format              | Demonstrated capabilities                                                  |
| ---------------- | ------------------- | -------------------------------------------------------------------------- |
| Terminal Signal  | 1080 × 1920, 16 s   | Curved green terminal, editable typing, sparse Motion actions              |
| Angel.exe        | 1080 × 1920, 12.8 s | Rotating imported 3D model, ASCII desktop and effect windows               |
| Cornell Box      | 1080 × 1080, 8 s    | Shared native 3D scene, chrome type, shadows/reflections and camera orbit  |
| Bloom Windows    | 1920 × 1080, 12 s   | Seamless flower timelapse with aligned dither, ASCII and cyanotype windows |
| Melt Mascot      | 1920 × 1080, 6 s    | Editable vector mascot, moving eyes and stretched Melt lettering           |
| Too Hot to Haunt | 480 × 480, 1.2 s    | Seamless photo collage with scale, blur and editable blocks                |

Orbit Study, Paper Motion, Colorfield, Transition Atlas, AFTERHOURS, In Bloom,
Motion Stress Lab and Sound Playground are retired from the gallery, search and
landing. Their existing regression workloads remain available internally; saved
projects created from them are independent documents.

## Layout and authoring

Each design has its own source directory, generator directory and public payload
directory. For example:

```text
apps/web/src/services/projects/templates/motion/cornell-box/build.ts
scripts/templates/cornell-box/generate.ts
apps/web/public/templates/motion/cornell-box/
  cornell-box.json
  cornell-box.musart
  cornell-box.commands.json
  cornell-box.webp
```

Run one generator with Bun, for example:

```sh
bun scripts/templates/cornell-box/generate.ts
bun scripts/templates/terminal-signal/generate.ts
```

`TemplateAuthor` uses public core commands, with command batches retained beside
the generated document. Rendering and playback do not author frame-by-frame keys.
`generate.ts` and `designed.ts` retain reproducible legacy fixture generation;
they also write one directory per fixture. They do not register gallery entries.
Shared licensed originals remain under `public/templates/motion/media/` alongside
their hashes and provenance. Media decoding uses actual video-stream metadata;
FFprobe is required by source-backed fixture generation.

The loaders bound streamed manifest bytes, validate identity/dimensions/mode and
portable schema, verify binary original sizes and SHA-256, then install through
`openMediaProject` atomically. Abort and stale-origin checks remain active.

## Covers

Generate posters from the actual evaluated Three.js render graph at a chosen
time, then inspect the resulting image before copying it beside its template:

```sh
bun scripts/templates/render.ts --url http://127.0.0.1:6100 \
  --input apps/web/public/templates/motion \
  --output artifacts/motion-template-covers \
  --template cornell-box --edge 720 --time 2.4
```

The renderer reads `<input>/<id>/<id>.json`. Artifact output remains a flat
capture directory. Covers establish rendered content, not smooth playback or a
16 ms frame-time budget. Follow the shared performance protocol for timing work.
