# Studio workspace

Open the project-name menu and choose **Workspace → Studio** or **Classic**.
This is a project-local presentation preference, independent of Static/Motion.
Switching replaces interface controls while retaining the same engine, document,
canvas, renderer, artboards, selection, history, assets and canonical camera.
No conversion, flattening, new document version or implicit history entry occurs.
Older projects default to Classic. Both workspaces retain the normal import,
portable-project, image/video export and headless command paths.

## Composition workflow

Studio overlays compact controls on the retained canvas:

- Quick Add inserts native editable 3D text, shapes/models, flat or extruded SVGs,
  and imported images, video or audio through the existing services.
- The composition dock embeds the regular pages and layers components. Visibility,
  locks, nesting, effect disclosure, ordering and masks use the existing commands.
- Selecting a spatial object exposes its existing native move/rotate/scale gizmo.
  Selecting text adds a direct content field, with typography, depth and bevel
  controls in its contextual panel. Locked ancestors remain authoritative.
- Material and scene docks use the regular material catalog, shared lighting and
  environment presets. Continuous sliders preview outside the document, commit
  once at release and restore on cancellation, owner changes or unmount.
- Fit, 100% reset and recenter remain available next to Quick Add. Wheel and
  trackpad behavior remains the canvas behavior; changing interface does not
  change the render camera.
- Advanced opens the regular Inspector and stackable effect controls. Studio uses
  the existing export workspace, including its actual supported export formats.

Studio does not add a separate Motion editor. Existing animated compositions
remain animated and editable through shared advanced controls or Classic.

## Backgrounds and effects

The Background control initially edits the ordinary composition solid/gradient
paint. **Enable background effects** copies it to an ordinary full-frame rectangle
at the bottom of the layer stack and clears the composition paint in one validated
transaction. The original foreground selection is preserved. Undo restores the
original document; redo restores the editable layer.

A full-frame, untransformed, root rectangle at the bottom of the stack is presented
as an editable background. It has no special name-dependent rendering behavior.
Its gradients, effects, blending, visibility and locks remain ordinary portable
layer data in Classic, Studio, previews, saved files and native exports. Transforming
or moving it out of that structural position returns the Background control to
composition paint. Effects are not applied by an unrelated CSS overlay.

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

The template gallery includes **Studio Starter**, a static 1440 × 1080 composition
with editable extruded text, native objects, shared lights and gradients. Its Studio
preference is stored before the newly allocated project is published. Other
existing templates keep their behavior and can be opened in either workspace.

```sh
bun run headless create --template studio-starter --output artifacts/studio.musart
bun run headless screenshot --input artifacts/studio.musart --workspace studio --output artifacts/studio.png
bun run headless render --input artifacts/studio.musart --output artifacts/studio-export.png
```

`--workspace classic|studio` changes screenshot presentation only. Rendering uses
the same document regardless of interface. Browser automation can use the explicit
`workspace` query parameter with `automation=1`. For live agent edits and genuine
activity logs in either workspace, see [the local agent bridge](agent-bridge.md).

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

A final native pointer-down to the next acknowledged canvas frame sample measured
**69.7 ms** with Playwright Chromium, the Three.js WebGPU backend, a 1600 × 1000
viewport and a 200% CPU quota. This is one development sample, not INP, a GPU fence,
a physical-display measurement or a production benchmark. The probe and rendering
regressions live in `test/browser/studio.spec.ts` and
`test/browser/support/studio-presentation.ts`; local captures and logs stay under
ignored `artifacts/studio/`.
