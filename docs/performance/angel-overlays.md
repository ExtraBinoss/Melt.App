# Angel.exe overlays and Window trails

## Shared interaction boundary

Local choice fields use `components/shared/SelectField`, backed by a genuine Radix nonmodal DropdownMenu with listbox/option roles. The field owns selected labels, bounded scroll shadows, disabled options, closed typeahead, keyboard navigation, draft cancellation, native form reset and owner supersession. Its popup uses Radix's trigger width, with no animation-frame measurement of transformed ancestors. The outer dialog keeps its intentional modal behavior.

Raw Radix Select acquires a page scroll lock and mounts a viewport stylesheet. In the captured export opening, the body scroll-lock attribute changed three times and a style recalculation visited 571 elements. A local field inside an already modal export dialog does not need another page lock. The shared replacement uses the existing dropdown positioning and selection primitives without patching dependencies or changing document styles.

`check:rules` rejects feature imports/re-exports of raw Select or direct Radix Select. Keep the unused upstream shadcn Select infrastructure and provenance intact; production consumers use the shared field. `AGENTS.md` records the boundary. `test/browser/angel-overlays.spec.ts` checks actual native input, equal trigger/menu width, selected focus, secondary releases, keyboard choice, Escape focus restoration and zero body style/scroll-lock mutations with Angel loaded.

The effect inspector focuses its own surface when opening. Automatically focusing its first Motion number field started an edit and paused transport. Actual focus/interaction with a property still starts the normal validated edit. Delayed close autofocus from a previous menu cannot dismiss a newly reopened menu or steal focus after its owner changes.

## Bounded geometry preparation

`packages/render/src/effects/window-trails/layout.ts` prepares at most 96 rectangles (32 copies × three ribbons) once per distinct time, logical size or geometry setting. Vector storage and uniform nodes are reused. Changing only raster density or colors does not rebuild positions. Future copies are compacted; negative time clears the active bounds. The fragment graph tests the enclosing rectangle before looking up active windows, using the same front-to-back ordering, role, head shadows and trail alpha.

This moves a small coordinate calculation out of every fragment. Source images, the raw 3D render, sampling, ASCII, edge/grid and X-ray treatments remain on GPU textures. There is no production pixel readback, additional model render or resolution reduction. Logical geometry stays independent of raster density. Nonsequential seeking remains deterministic.

## Measurements and limits

Source base: `2916a97` plus the reviewed overlay/layout diff. The isolated development server was on port 6113. Native Chrome 156, Linux x86_64, Intel Xe-LPG WebGPU, 1600 × 1000 viewport, DPR 1, 473 × 840 editor canvas. Runs were serial, low priority, CPUQuota 200%, MemoryHigh 2500 MiB, MemoryMax 3300 MiB and no swap. Artifacts are ignored under `artifacts/overlay-lag/`.

The baseline development input-to-first-visible-RAF samples were 76–106 ms for the playing export resolution menu and 303–565 ms for the playing effect inspector. Paused samples were 128–214 ms and 199–217 ms respectively. After the shared field/focus change, menu samples were 98–118 ms playing and 98–144 ms paused; inspector samples still varied from 243–380 ms playing and 292–510 ms paused. These short development cohorts include React development overhead and CPU sampling. They establish that a remaining mount cost exists; they do not establish a reliable overall latency improvement. A second RAF is a presentation opportunity, not a physical display timestamp. Invalidation tracing was separate because its overhead greatly increases timings.

Two separate production builds retained their matching bundles/source maps. The initial compiled comparison (same hardware/scope, two openings per phase) measured:

| Input → first visible RAF           |         Baseline | Shared field/layout |
| ----------------------------------- | ---------------: | ------------------: |
| Export menu, playing (first / next) |  261.8 / 74.9 ms |      63.2 / 73.3 ms |
| Export menu, paused                 |   43.0 / 47.8 ms |      62.4 / 80.4 ms |
| Effect inspector, playing           | 213.6 / 125.8 ms |    160.8 / 103.5 ms |
| Effect inspector, paused            |  50.1 / 130.0 ms |      49.1 / 89.4 ms |

The first baseline menu included 107.8 ms of input queueing, versus 2.1 ms with the prepared layout/shared field. These are whole-workload results, not isolated select-only speedups. The paused-menu cohort regressed; the new menu's anchored positioning and focus still cost time. Do not claim uniformly faster menus or guaranteed 60 fps from this small cohort. Keep the nonmodal boundary because it removes page-wide mutations and keeps the tested semantics. The initial compiled cohort preceded the final supported focus-handler adjustment and integration of upstream `2b4488c`; the final native witnesses validate those changes.

Native GPU timestamp queries over 36 identical poses (4.000–5.167 s) measured the Window trails pass at median/p95 **6.73/8.28 ms** with the original fragment paths and **6.32/6.62 ms** with prepared rectangles. Other passes varied: total GPU medians were 7.5 and 9.2 ms respectively. Do not attribute total-frame improvement to this comparison: GPU load/clock variance prevents that conclusion. Moving background ASCII into the no-window branch regressed the pass to approximately 7.65 ms and was rejected. Source rendering density was preserved because it affects edge derivatives and ASCII sampling.

Focused layout tests cover all three paths, negative speed, stable storage, seeks, empty poses, authored resize and density/color no-ops. The existing native WebGPU/WebGL witness covers amount-zero identity, seek repeatability, the shared model, resource cleanup and the 50-image workload. The focused overlay witness validates interaction under active playback. Unit tests alone do not establish rendered pixels or native focus behavior.

Final integrated native checks passed on both backends, including the 50-image cases, primary drag-release choice, secondary release rejection, keyboard/focus and zero body style/lock mutations. Eight before/after captured poses per backend were also pixel-identical (maximum channel difference 0). The 103 focused UI/rule consumer tests and 14 layout/shared-uniform tests passed before upstream integration; only affected checks are repeated after source changes. Full CI/coverage is not claimed by these focused checks.
