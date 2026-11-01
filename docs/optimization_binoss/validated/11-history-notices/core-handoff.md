# Core handoff

Implemented authoritative, frozen undo/redo descriptions in the engine's existing short history. Command collectors retain at most 64 semantic changes and 120 Unicode code points per string; overflow and truncation are explicit. Unchanged scalar patch fields reserve no capture capacity. Repeated property writes retain the first before value and final after value; keyed locations include time/occurrence identity. Different owners retain their own values rather than inventing a shared color.

The exhaustive command registry delegates to layer, page, scene, effect, Motion and audio collectors. Metadata follows actual command context and explicit inactive-page targets. Definitions reuse existing Motion schemas and effect parameter labels, scales, choices and units. Structural vector/gradient/morph data is represented by actions; large paths, contours, originals, commands and snapshots never enter descriptions. Morph comparisons distinguish actual structural edits from cloned unchanged recipes. The durable journal format is unchanged.

Descriptors are retained with undo entries, including commits before notice observers mount. Branching, custom history limits, load, failed/cancelled/stale prepared transactions and reentrant publication preserve engine semantics. Existing commit-info fields remain compatible; the optional `history` field is additive.

Owned production paths: `packages/core/src/history/**`, `packages/core/src/session/engine.ts`, `packages/core/src/animation/model.ts`, and the history exports in `packages/core/src/index.ts`.

Prepared focused regressions: `packages/core/test/history/{transactions,retention,properties,motion,structure}.test.ts`, with `support.ts`. They cover inactive pages and page-changing transactions, scalar/structural properties, compound and repeated writes, mostly unchanged bulk patches, overflow and retained updates after capacity, Unicode truncation/freeze/detachment, rejection/cancellation/staleness, late observers, reentrant undo, all property families, static/keyed scene properties, effect schemas/morph recipes, media mute/volume/source offsets, audio processing/trim, actual mask owner and layer-owned guides.

Only the targeted formatter was run. No tests, build, typecheck, lint, browser checks or Git operations were run by this worker. Root owns validation.

Display limits are deliberate: descriptions preserve individual owner/property values up to the bounded limit; structural geometry and gradient-stop topology receive specific action names instead of copying their data. Time values are display seconds; authoritative exact rational times stay in the undo snapshots.

Suggested changelog entry: Preserve specific property names and restored values in undo/redo notices across artboard backgrounds, layers, effects, 3D, Motion and audio edits, with authoritative transaction descriptions and truthful bounded summaries.
