# Studio workspace

Open the project-name menu and choose **Workspace → Studio** or **Classic**.
This is a project-local presentation preference, independent of Static/Motion.
Switching replaces interface controls while retaining the same engine, document,
canvas, renderer, artboards, selection, history, assets and canonical camera.
No conversion, flattening, new document version or implicit history entry occurs.
Older projects default to Classic. Both workspaces retain the normal import,
portable-project, image/video export and headless command paths.

## Composition workflow

Studio fits the complete active composition inside the viewport with uniform scale.
Landscape projects retain their aspect ratio on portrait screens. This presentation
zoom does not change the portable composition or its camera.
The surrounding workspace continues ordinary background paint to the window edges;
it does not enlarge the composition or stretch its objects. Native effects and exact
output remain evaluated inside the canonical capture gate.
Switching back restores the Classic view. Objects outside a capture guide remain
editable and are retained in the project.

- Icon-only quick insertion uses native text, shapes/models, flat or extruded SVGs,
  images, video and audio services. Separated toolbar groups contain insertion,
  effects/color adjustments and view controls. Top tooltips open below their buttons;
  bottom tooltips open above. Export retains the primary theme accent.
- The closed composition control opens the existing pages and layer components,
  including visibility, locks, nested effects and ordering.
- Selecting text reveals an outlined text input, font, font size, depth and bevel
  directly in the centered object bar. Models and primitives expose proportional
  size and X/Y rotation. Position, axis scales and Z rotation are available in the
  contextual popover alongside extrusion tessellation quality when applicable.
- Material and scene controls open on demand. Their 134 materials and 62 environment
  entries are grouped into initially expanded categories; each project's preferences
  remember collapsed categories. Sphere atlases are rendered with the native engine
  ahead of time, avoiding a renderer per swatch. The original eleven lit environment
  presets retain their exact RoomEnvironment geometry and colors.
- The closed material and environment tools use native sphere atlas thumbnails.
  Material editing requires one unlocked native object; its disabled tool explains
  this requirement. Material properties sit beside the catalog. The scene panel's
  direction pad, distance and focal-angle controls edit the composition camera.
- Sliders preview imperatively, commit once on release and restore on cancellation,
  owner changes or unmount. Neutral surfaces use the shared theme without glows.
- Recenter restores the immersive view. Wheel/trackpad navigation and pointer zoom
  retain the existing canvas behavior. Classic retains its fit and 100% controls.
- Advanced opens the regular Inspector. There is no agent activity surface in Studio;
  opt-in automation remains available without interrupting manual composition.

Studio picks actual prepared native triangles, including glyph counters and imported
model geometry, and omits their ordinary 2D selection frames. Structural background
paint is selected from the layer tree rather than stealing blank-canvas clicks.
Native hover/selection contours sample retained GPU coverage before ordinary
post-composite effects/masks. Hover pulses twice then settles; reduced motion uses
a static contour. No extra native render target, GPU readback or perpetual idle
animation is required. Dragging empty space or a native object orbits the single
composition camera; selected gizmo handles retain native transforms. Hand/Space,
wheel navigation and direct dragging of ordinary 2D artwork retain their behavior.

Studio does not add a separate Motion editor. Existing animated compositions remain
animated and editable through shared advanced controls or Classic.

## Capture guides and export

Capture guides and the export workspace share the existing social/video format
catalog, SVG aspect thumbnails and custom dimensions. A guide highlights the
centered capture rectangle within the current visible composition window. Full view
captures that entire window. Guide preferences never modify layers or history.

Opening export in Studio captures the visible window and defaults to its guide's
format. Preview, still image, motion and timelapse paths pass the same typed
`OutputFraming` through the shared renderer. The GPU renders the original scene at
the required sampling density, applies all effects, then crops its final texture.
It does not resize or reflow a derivative document. Classic defaults to the original
composition and can also select a format. Selecting another artboard resets the
format to that artboard. Selection exports retain their existing isolated behavior.

Output dimensions must be integer pixels from 1 through 16384 per edge, with at
most 64 megapixels after scaling. Invalid requests fail instead of being capped.
Print bleed requires original full-artboard output; framed print explicitly disables
bleed. The original project and undo history remain intact.

## Background recipes and effects

Background initially edits ordinary composition paint. **Enable background effects**
copies it to a normal full-frame rectangle at the bottom of the layer stack in one
validated transaction. Foreground selection is preserved.
The compact controls expose transparent, solid and gradient modes. Linear direction
and radial position use the same captured-pointer pad as the camera, with live
previews, cancellation and one undo entry. The advanced paint popover retains the
shared full gradient editor. Effect menus in both workspaces share 45 static native
thumbnail exports; opening a catalog starts no GPU preview work. Regenerate them
with `bun scripts/effects/render-catalog.ts` against a running local editor.

The 65 gradient recipes are grouped into glossy plastic, cinematic, social,
editorial and atmosphere palettes. Hover or keyboard focus previews the entire
recipe through the existing GPU preview graph. Leaving, closing, switching owner,
changing transport time or editing cancels that draft without a history entry.
Clicking commits a single `applyBackgroundPreset` command and preserves selection.
Recipes use ordinary editable gradient stops plus Melt's existing grain and a
reusable Feather effect. There is no parallel CSS treatment or baked image.

Radial gradients support circle/ellipse, center coordinates and radius in the shared
paint controls. Legacy radial gradients retain their original ellipse behavior.
Feather exposes center, radius, softness and amount as a normal alpha effect,
available to Classic, Studio, saved projects, motion, export and headless commands.
A recipe can be authored directly:

```ts
engine.execute({
  type: "applyBackgroundPreset",
  presetId: "atmosphere-aurora-mist",
  options: { grain: 0.06, feather: 0.35 },
});
```

A full-frame untransformed root rectangle at the bottom of the stack is recognized
structurally as the background. Its gradients, stack, blending, visibility and locks
remain ordinary layer data. Moving or transforming it out of that position returns
the Background control to composition paint. Existing locked backgrounds reject edits.

The direct Effect and Color grade controls target the selected editable layer, or
the whole composition when nothing is selected. Composition effects are an ordinary
optional `Composition.effects` stack, evaluated after all paint/layer blending and
before final output/color presentation. They share the normal effect operators,
validation, caches, asset ownership, undo, clipboard and export paths. Source-only
morphing remains a source operation. Image-input configuration for composition
stacks is currently limited to portable/command-authored inputs.

## Optional offline model pack

The default library remains the existing curated 16 models and native shapes.
The **Packs** tab offers **474** models from Kenney's Nature Kit and Prototype Kit.
The optional archive is **2,599,905 bytes**, with **6,168,695 bytes** of expanded
originals and licenses. It is not downloaded during editor startup or merely by
opening the pack tab. Downloading is explicit and cancellable.

The catalog uses one metadata record followed by one model per line in a pinned NDJSON manifest.
The installer verifies the manifest and ZIP SHA-256 values, unpacks in a bounded
worker, verifies every self-contained GLB and publishes an offline-cache marker
only after all entries are installed. Missing cache entries report failure instead
of silently using the network. The picker shows at most 24 search results per page
and one retained native preview with the original material. Import embeds the
original into the project through the standard validated model import, so the
project remains portable even after the optional library cache is cleared.

Source bytes, archive and original/output hashes, author, source links and CC0
licenses are retained in `public/spatial/packs`. Rebuild from the pinned archives
with `bun scripts/spatial/bundle-studio-pack.ts`. This is a versioned curated pack,
not a claim of integration with an external asset service.

## Starter and automation

The template gallery includes **Studio Starter**, a static 1920 × 1080 composition
with one centered editable MELT word, shared lights and gradient paint. Its Studio
preference is stored before the newly allocated project is published. Other
existing templates keep their behavior and can be opened in either workspace.

```sh
bun run headless create --template studio-starter --output artifacts/studio.musart
bun run headless screenshot --input artifacts/studio.musart --workspace studio --output artifacts/studio.png
bun run headless render --input artifacts/studio.musart --output artifacts/studio-export.png
```

`--workspace classic|studio` changes screenshot presentation only. Rendering uses
the same document regardless of interface. Browser automation can use the explicit
`workspace` query parameter with `automation=1`. For opt-in live agent automation and command logs, see [the local agent bridge](agent-bridge.md).

## Local verification

Focused checks exercise the real Studio/Classic switch, byte-identical PNG exports,
retained canvas identity, direct text/depth editing, pointer and keyboard slider
commits, undo, locks, the shared export dialog and mobile placement. Separate native
cases install the starter from the gallery and restore its saved mode after reload,
insert an extruded SVG and an offline GLB, and pair an actual Bun WebSocket relay
while rejecting stale agent edits. The native Classic gizmo case also verifies
rotation, orbit, projection changes and zero additional canvas draws over one
second after queued work settles.

The real `headless create`, `headless screenshot --workspace studio` and
`headless render` commands were exercised against the local development server on
port 6100. Focused integration tests, strict TypeScript, type-aware lint, React
lint, formatting and contribution rules are checked separately from release CI.

## Production presentation measurements (2026-11-05)

An isolated production build with source maps was served on port 4186. Chromium
156.0.8078.4 used the Three.js WebGPU backend on Linux / Intel Core Ultra 5 125H,
1600 × 1000, one worker, with the browser runner limited to 200% CPU and 2.9 GiB
memory (no swap). This historical cohort used the earlier five-object starter,
before it was replaced by the current single-word template.

| Native gesture to acknowledged preview | Samples | Median  | Maximum |
| -------------------------------------- | ------- | ------- | ------- |
| Material roughness slider              | 7       | 25.6 ms | 80.4 ms |
| Native grain + Feather gradient hover  | 7       | 35.3 ms | 99.9 ms |

These measure browser dispatch through the next acknowledged composed frame,
not physical-display latency, field INP or a cross-device guarantee. The sample
maximum is also the nearest-rank p95 for this small cohort; the full samples are
retained in `artifacts/studio/presentation-performance.json`.

During previews, App, CanvasArea, EditorCanvas and EditorScene React counters
remained unchanged and the portable document was unchanged until release. After
seven slider gestures and seven recipe previews, retained GPU cache usage was
100,859,790 bytes (96.2 MiB), 39 compositor targets and 60 native node programs.
Across a settled 1.1-second idle observation there were zero additional composition
or display frames, with identical resource counters. Instrumented GPUBuffer.mapAsync,
WebGL.readPixels, Canvas2D.getImageData and VideoFrame.copyTo recorded zero production
pixel readbacks. Native PNG decoding separately verified exact crop dimensions,
orientation, composition-wide effects, distinct radial-gradient colors and Feather alpha.

Preview fidelity remains adaptive under the existing GPU memory limits. In dense
3D scenes the estimator conservatively uses authored bounds before prepared mesh
bounds are available; this can lower on-screen resolution. Do not reduce the real
56-byte MSAA/depth source allocation or raise caps to disguise it. Export remains
at its explicitly requested resolution. Composition effect admission now accounts
for all three final surfaces, shared scratch, native image inputs and bounded glyph
uploads. Empty legacy composition stacks retain their previous estimates.

Reproduce functional and presentation checks with `studio-backgrounds.spec.ts` and
`studio-performance.spec.ts`, using an isolated production preview as described in
[the performance protocol](../performance/protocol.md). Source diff, hashes,
compiled output, source maps and captures for this cohort are in `artifacts/studio`.

In an earlier production cohort, before the final shared-shape gradient correction,
the separate 2400 × 1500 stress composition (50 photos, 100 effects, five groups,
ten masks) also passed native preview, decoded export, storage thumbnail, loss
recovery and zero-readback checks. In this constrained local cohort, cold first
presentation took 19.187 s; twelve move samples had a 58.5 ms median / 196.2 ms p95,
and twelve effect edits had an 82.4 ms median / 157.6 ms p95. The full-resolution
export took 8.546 s. This heavy cold path remains substantially more expensive
than an already prepared Studio preview. The full observations and pixel witnesses
are in `artifacts/performance-50.json`; no test thresholds were loosened. The test
now separates settled pan assertions from the deferred zoom-density frame rather
than assuming that a host-side round trip always precedes its 140 ms debounce.

A separate DevTools startup trace used Chromium 140’s WebGL fallback on the default
2D demo. FCP/LCP were 340 ms, CLS 0 and the critical network chain 341 ms. Its LCP
was the opening mascot, not the canvas: the canonical GPU frame was acknowledged
at 6.858 s. Therefore the shell LCP must not be presented as editor readiness. This
trace reported 69 ms of synchronous startup layout; it estimated no LCP savings from
render-blocking resources. No optional model packs, sphere atlases, ONNX or WASM
were requested at startup. These are a different backend/scene from the Studio
WebGPU gesture cohort. The local trace summary is
`artifacts/studio/devtools-startup-summary.json`.

## Continuous native controls

Native text, typography, scene and object properties use certified preview lineage.
A same-owner in-flight preparation may finish while the most recent sample is
coalesced; changing selection, source, project, document or cancelling invalidates
that lineage immediately. This avoids starving geometry during continuous input.
Empty and whitespace-only text create real zero-triangle native geometry through
the existing worker path. Valid typing resumes without a fabricated success or
replacement image. Source/font/vector failures still report actual errors.

The starter uses a compact frame derived from the bundled Inter uppercase metrics,
so the visible word and native transform/orbit origin align. Its one native source
keeps the preview within existing GPU budgets. The document/export dimensions stay
1920 × 1080; browser pixel density follows the actual viewport and device ratio,
independently of print DPI. Existing projects are not silently resized.

The focused native flow regression (`studio-flow.spec.ts`) also validates real
triangle picking, a projected gizmo center within the word’s ink bounds, a 1600px
native render for a 1600px displayed canvas at DPR1, constant parent React counters
during preview, intermediate geometry frames before pointer release, intermediate
text frames before blur, empty-text recovery, one undo entry, portrait resizing
without cropping and zero production pixel readbacks. Its final production run
recorded 36 intermediate geometry frames during 90 pointer moves and four text
frames during typing; first acknowledged updates were 66.2 ms and 51.1 ms respectively
on the constrained local runner. These are frame acknowledgements, not a guarantee
of physical-display latency or a constant frame rate. Captures and evidence remain
under ignored `artifacts/studio/flow-live-evidence.json`.
