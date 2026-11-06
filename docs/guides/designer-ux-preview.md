# Designer UX preview

The `feat/designer-ux` branch groups three independent designer workflows: selecting
artwork through overlap, reusable effect presets/treatments, and named color
palettes with explicit document links. The normal Three.js/TSL renderer and
validated engine command/history paths remain authoritative.

## Local preview

From the separate designer worktree:

```sh
bun install --frozen-lockfile
bun run dev --port 6102 --strictPort
```

Open `http://localhost:6102/editor`. This origin has its own browser project and
personal-library storage; projects saved on port 6100 are not automatically copied
to port 6102. Open a portable project to test the same artwork in the preview.

## Selection

Normal picking passes through prepared source transparency and empty vector
regions. Locked layers remain accessible in the layer tree/context picker.
Ctrl/Cmd+Shift+primary click cycles overlapping candidates; ordinary Ctrl/Cmd
selection and Alt/drag behavior retain their existing roles. The canvas context
menu exposes a candidate list with hover outlines and names. A selected drag
keeps its original target until release/cancellation.

Source-alpha preparation uses a bounded worker/cache, not compositor GPU pixel
readbacks. Prepared original coverage does not claim exact picking of arbitrary
GPU effects or time-varying video alpha; the explicit candidate list remains
available for overlap that cannot be inferred from the original pixels.

## Presets and treatments

Each effect exposes a preset selector, named saving, modified status and saved
preset restoration. Factory defaults are a separate operation. A saved preset is
an independent personal-library item; applied values remain portable/editable.
A missing library record never silently substitutes factory values.

A treatment saves an ordered effect stack and can append to or replace a compatible
owner's stack in one undo transaction. Source-owned paint, morph geometry and
generated depth inputs are excluded from reusable data. Project-local color links
are excluded too: applying literal saved colors detaches those links, and Undo
restores the previous binding and values together.

## Palettes

A palette shortcut beside existing color-picker controls opens a nonmodal library.
Named palettes can be reused across projects; explicit document colors and links
travel inside a project. Choosing a saved swatch locally and linking a property
to a document color are distinct actions. A linked global edit updates all bound
owners in one validated transaction, while detaching preserves local appearance.

Dice variations preserve locked colors and use coherent perceptual color changes.
Their preview is temporary; Apply commits one change and Cancel/unmount discards
the draft. Saving a named variation is a separate library action. A stale editing
target and conflicting saved-library revisions produce real errors.

## Verification scope

Focused tests pass for selection/layout, worker source-cache disposal,
preset validation/library/application, palette variation/link commands/library,
shared color controls and palette/preset interoperability. The native
`overlap-selection.spec.ts` scenarios pass in Classic and Studio;
`effect-presets.spec.ts` and `saved-palettes.spec.ts` pass for real input,
focus, nonmodal body styles, visible rendering and personal-library reloads.
The palette scenario checks actual canvas pixels alongside unchanged document
revision and root render counters during preview. Selection timing attachments
measure native input to useful DOM and the following RAF, not physical display
latency; development-server timings are not a production benchmark.

Production-source TypeScript and the stricter pure-core TypeScript check pass.
The full `bun run typecheck` still reports existing test/script typing errors,
including Testing Library `exact` options and an incomplete effect-catalog test
fixture. This preview does not claim that the repository-wide CI gate passes.
Captures and local test configuration belong in ignored `artifacts/designer-ux/`.
