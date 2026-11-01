# Terminal Signal

Open **Templates → Motion → Terminal Signal** for the phone-format terminal study:
1080 × 1920, 9:16, sixteen seconds at 60 fps. Its text, background grid, screen
frame, cursor, screen treatment and movements remain editable native objects.

The supplied terminal-expression video informed the incremental typing, bright
green phosphor, curved screen and repeated closing lines. The template contains
original editable placeholder text and uses the bundled Roboto Mono font.

## Customize the template

- Select **Edit your message / eight lines** to replace the transcript in one text
  object. It uses eight rows, 24 columns, a 56 px font and 1.5 line height.
- Its **Terminal · Type** action controls the complete reveal with two progress
  points. Change its duration or easing, reverse it, or save it to **My presets**.
- In the Terminal effect, match **Rows** and **Columns** to the text layout when
  changing its geometry. The reveal uses a regular spatial grid, so a monospace
  font keeps each cell aligned with a character. Short lines simply leave a pause
  before the following line; changing text does not create more document keys.
- Edit **Transcript / shared movement** for the shared rise and screen tilt.
- The three **Edit closing line** text objects have independent two-point typing
  actions. Their parent owns the final drift and rotation.
- The **Screen** group owns the existing CRT effect: curvature, scanlines, glow,
  grain and flicker. Its explicit time channel has two points. The **Background**
  group contains the editable grid shapes.
- Change both the text fill and Terminal cursor color to recolor the signal.
  Use the normal Motion export for full-resolution phone video. This template
  has no audio tracks.

## Reusable Terminal effect

**Effects → Terminal** works on the existing GPU source texture, including text,
shapes, images, video and rendered 3D sources. Progress reveals cells in reading
order, left to right and top to bottom. Columns and rows describe the source's
full local rectangle. This is a spatial reveal, not a semantic text-layout parser.

Cursor choices are None, Block, Underline and Line highlight. A cursor may add
coverage inside the current cell/line even where the source is transparent.
Progress 100% reproduces the source and removes the cursor. Amount zero restores
the source at every progress value. Blink rate zero keeps the cursor steady;
other rates use the effect's explicit time in seconds. Preview, arbitrary seeking
and export share that same deterministic, one-texture-read TSL graph.

## Regenerate and verify

```sh
bun scripts/templates/terminal-signal/generate.ts
bun scripts/templates/render.ts --url http://127.0.0.1:6100 \
  --template terminal-signal --time 6.8 --edge 960 \
  --output apps/web/public/templates/motion
```

The generator records validated public-command batches beside the portable
project and gallery manifest. Replaying the batches reproduces the same project.
The template has four typing actions with two points each; shared transforms use
at most four keys per property. The poster is encoded from the real Three.js
render graph, at 6.8 seconds.

Focused regressions cover validation, transactions, undo/redo, portable round
trips, deterministic seeking and gallery opening. Native Chromium checks decode
GPU PNGs on a separate validation page and exercise WebGPU plus Three's WebGL
fallback. They verify reveal order, exact endpoints, cursor modes, blinking,
repeatable poses, 50 distinct image textures with stable effect-cache accounting,
and explicit resource disposal. Production pixel-read API counters remain zero.
Captures and the native 540 × 960, 60 fps MP4 preview live under the ignored
`artifacts/terminal-signal/` directory.
