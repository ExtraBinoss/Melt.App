# Landing, branding and startup performance — fresh-conversation handoff

Updated November 1, 2026. This document records the user's priorities, existing
work, measurements and unfinished verification. It does **not** mean the pending
changes are finished, committed or pushed.

## Resume instruction

Read this document, `AGENTS.md`, `docs/architecture/contracts.md` and the relevant
performance contracts before editing. Inspect the current Git diff first. Resume
from the existing implementation; do not recreate completed engine work or discard
another conversation's changes.

The user stopped implementation and profiling for the night, then requested this
Markdown so a new conversation can take over. The only work authorized in that
last turn was saving this handoff. Start further implementation when the user
resumes it.

Workspace: `/home/albi/Documents/Projects/Hackaton/MuseArtWeb`.
The user's existing development server is on **port 6100**. Do not replace it,
kill their daily Chrome/Firefox sessions, or silently serve another worktree.

## New priorities from the user

1. Improve the landing page's actual and perceived loading speed.
2. For landing showcase projects, use **prerendered videos and images** instead
   of opening the full project/render engine on hover. This should avoid paying
   decoding, compilation and project initialization costs for a marketing card.
3. Investigate remaining delays on the landing itself, including the mascot
   appearing late and the **Try Melt → dashboard** transition. The user feels that
   transition has improved somewhat but still sometimes takes too long.
4. Use a lightweight **static image, preferably WebP, for static mascot/logo
   appearances**, and the animated SVG when animation is needed. Hover is one
   trigger; keyboard focus and explicit loading/working states also matter.
5. Simplify the mascot's SVG paths where possible, keeping essentially the same
   shape — the user's target is approximately **99% fidelity**. Preserve the real
   gradient, eyes, proportions and animation identity.
6. Optimize the general pipeline. The user explicitly believes the problem is
   broader than the mascot and asked for measurements before blaming it.

The mascot must remain animated when appropriate. A transform-only replacement
for its original animated morph was proposed during the investigation and then
**reverted**. No path simplification or static WebP mascot substitution has been
implemented yet.

### Landing media direction

- Generate posters and seamless preview clips from the real project/template
  through the existing Melt renderer/export path where appropriate.
- Load a poster immediately; defer videos according to visibility and actual
  intent. Keep decoding/concurrent playback bounded and stop offscreen media.
- Reuse the existing crossfade behavior: keep the poster until the replacement
  is ready, with no blank flash, layout jump or disappearing frame.
- Record template/project revision and original-asset identity with generated
  media so modified projects cannot keep stale previews.
- Preserve aspect ratio and authored timing. Choose display-appropriate media
  sizes rather than downloading every full-resolution clip on page load.
- This new direction explicitly concerns the landing. Do not silently replace
  editor, export or interactive library previews with baked media; their genuine
  engine behavior and shared playback logic are still required.

### Hybrid mascot direction

- Audit `MeltLogo`, `BrandStatus`, throbbers and branding call sites first.
- Static appearances should not initialize the morph engine or an SVG animation
  loop just to display an unchanged logo. Keep the public component/config shared.
- Generate static assets from the actual approved mascot, including the purple
  gradient. Do not invent a new mascot, palette or pastel substitute.
- Support the application's selected theme, not only the OS color scheme, if
  theme-specific assets are needed. Preserve existing favicon/brand identifiers.
- Keep image and SVG bounds, visible scale and baseline aligned. Retain the image
  until the animated module/first SVG pose is ready, then crossfade cleanly.
- Preserve keyboard focus, touch behavior, accessible naming, reduced motion,
  offscreen suspension and cleanup. Avoid duplicate accessible images.
- Explicit active loaders must still have an animated mascot. Static-image
  substitution is not permission to remove the original working animation.

### Shape simplification direction

The current radial profile has **64 samples**; body and eye paths use cubic
segments. Relevant files:

- `apps/web/src/ui/brand/MeltLogo.tsx`
- `apps/web/src/ui/brand/render-frame.ts`
- `apps/web/src/ui/brand/playback.ts`
- `apps/web/src/ui/brand/dahlia.ts`
- `apps/web/src/ui/brand/engine/shape.ts`
- `apps/web/src/ui/brand/engine/eye-shape.ts`
- `apps/web/src/ui/brand/engine/profiles.ts`
- `apps/web/src/ui/brand/config.ts`

Retain upstream notices/licenses and generated-profile provenance. Compare several
poses, morph transitions, sizes and DPRs before accepting fewer points. Measure
contour/edge error and silhouette fidelity; a high whole-image similarity score
mostly caused by empty background does not establish 99% shape fidelity. Avoid a
runtime simplification algorithm that costs more than the path generation it saves.

## What was measured

Environment: native Chrome **156.0.8078.79**, Linux, viewport **1600 × 1000**,
development server on 6100, low priority and **CPU quota 200%**. Checks used a
**1600 MiB soft / 2400 MiB hard memory budget, no swap**. These are individual
**diagnostic samples, not production benchmarks**. Memory pressure affected the
editor captures. A full editor trace was stopped; lighter CPU profiles completed.
Do not sum overlapping timing categories or call native waiting time GPU shader
execution time.

| Scenario                                 |                                   Before |                                     First measured update | Other observations                                                                    |
| ---------------------------------------- | ---------------------------------------: | --------------------------------------------------------: | ------------------------------------------------------------------------------------- |
| Try Melt → visible templates             |                                 5,613 ms |                    Not remeasured with all latest changes | 778 script/style requests; 195 ms style recalculation; 48 ms layout                   |
| Open Bloom Windows template              |                                23,845 ms |                                                 15,750 ms | About 34% shorter in these diagnostic samples                                         |
| Reopen saved Bloom Windows               |                                12,396 ms |                                                 11,785 ms | Most remaining development startup cost still present                                 |
| Cold template native sizing              | About 4,443 ms sampled in sizing methods | About 73.6 ms in measured native editor dimension setters | Different instrumentation boundaries; not a precise same-metric percentage comparison |
| Saved-project native sizing after update |                                        — |                          About 6.2 ms in measured setters | Same final dimensions, no oversized temporary editor buffer observed                  |

The updated editor records exactly two native dimension assignments for the first
frame: width **1068**, height **601**. This is one final size change expressed as
two canvas property writes, not proof of a single internal GPU allocation.

Mascot inclusive JavaScript sampling, including descendants/native DOM calls:

| Scenario             | Mascot sampled time | Approximate share of elapsed time |
| -------------------- | ------------------: | --------------------------------: |
| Try Melt → templates |               93 ms |                              1.7% |
| Open Bloom Windows   |              302 ms |                              1.3% |
| Reopen saved project |              253 ms |                              2.0% |

The direct mascot-JavaScript figure for Try Melt was 69 ms; 93 ms includes its
sampled descendants. Browser SVG paint is part of shared paint work and was not
isolated by these CPU figures. The evidence therefore supports prioritizing the
broader startup path, while still allowing a useful static-logo optimization.

A separate earlier DevTools capture observed a **1,353 ms style recalculation**
affecting 1,042 elements and a **166 ms focus-related reflow**. It used a different
session/setup and is not a controlled before/after comparison.

An early click on the old server-rendered Try Melt button could leave the landing
URL unchanged before hydration. That failed activation is **not** a 30-second
project load measurement. Native hrefs were added to address this.

### Captures and reports already available locally

These paths are under ignored `artifacts/`; they may not exist in another checkout.
The tables above retain the essential results without depending on those files.

- `artifacts/video-stress/startup-profile-current/`: library CPU profile, trace,
  report and reviewed source patch.
- `artifacts/video-stress/project-cpu-profile/`: template and saved-project CPU
  profiles, browser metric snapshots and report.
- `artifacts/video-stress/project-cpu-profile-after/`: first updated profiles,
  native dimension-write counters and reports.
- `artifacts/video-stress/profile-project-after.mjs`: reproduction script.
- `artifacts/video-stress/player-ui-check.png` and `.json`: real Chrome player
  rendering/interactions, zero instrumented JS pixel-read APIs and no page errors.
- `artifacts/video-stress/firefox-webgl-preview.png` and `.json`: earlier native
  Firefox rendering witness. The user also confirmed WebGL fixed Firefox playback.
- `artifacts/video-stress/RESUME.md`: earlier detailed local handoff.

**The updated profiles predate the latest lazy Toolbar/EditorSidebar/timeline
split and dashboard editor-code preload. Those changes still need measurement.**

## Existing local implementation to preserve and finish

### Rendering and foreground priority

`apps/web/src/canvas/render/exact-canvas-target.ts` uses Three's public
`CanvasTarget` / `setCanvasTarget()` APIs. R3F retains CSS size and DPR intent;
acknowledged frames own exact physical texels at native DPR 1. This avoids the old
sequence of temporary DPR-scaled buffers followed by an exact-size repair.

- Installed before renderer initialization, including WebGL fallback attempts.
- Keeps native size, viewport and physical-DPR getters coherent.
- Keeps fractional/non-square exact texels, including `778 × 17 → 159 × 4`.
- Uses idempotent cleanup; no private Three-field patch, alternative renderer or
  production pixel readback.

`apps/web/src/services/session/render-activity.ts` is engine-scoped and gives the
foreground canvas priority over optional thumbnail rendering. Initial editor
startup and library-to-editor opens hold optional work until a genuine canonical
presentation, with cancellation on failure/unmount. Notifications are transitions,
not a new React frame clock.

Related entry points: `EditorScene.tsx`, `drawing-density.ts`,
`services/session/runtime.ts`, `bootstrap/Studio.tsx`.

### Startup and deferred interface

- Centered `StudioPreparation` mascot increased from 52 to 80, with its original
  animated SVG morph, eyes and gradient retained.
- `ui/navigation/NavigationButton.tsx` preserves a real href before hydration,
  client routing for primary activation, modified clicks and disabled semantics.
- Preferences, shortcut help, timelapse, export workspace and mobile UI are lazy.
- Latest changes also defer Toolbar, EditorSidebar and MotionTimelineDock inside
  local Suspense boundaries, so they do not suspend the canvas region.
- `bootstrap/preload.ts` schedules code-only Studio preparation during landing
  idle time. It respects hidden pages, cancellation and data-saving preferences.
- Studio schedules code-only editor preparation after two seconds plus idle time
  on the dashboard, skipping it while a motion preview is playing. No runtime,
  worker or GPU instance is created by merely importing that code.

Keep the cost of preloading visible in measurements. Moving work earlier is not
eliminating it; distinguish cold activation from an already-prepared route.

### Other unfinished work from this conversation

- Shared video backend policy in `packages/render/src/renderer/video-backend.ts`:
  desktop Linux Chromium video uses Three WebGL conservatively; other platforms
  retain WebGPU when native VideoFrame import is supported. Firefox unsupported
  imports fall back through a cached synthetic upload probe. No pixel readback.
- Adding the first video reevaluates the native surface without replacing the
  document/history. Standalone sessions retire resources through their queue.
- DEV `[Melt renderer]` reports actual selected backend. Never claim that X11
  alone fixed WebGPU: the earlier successful X11 case was actually WebGL.
- Card progress is at the **divider between artwork and project title**, not the
  top of the card.
- Open in Melt dialogs import the **existing shared MediaPlayer**, positioned
  at the bottom over the artwork with a themed translucent blur. Accepted-frame
  position source, pause, time input, paused seeking, latest-request cancellation
  and inclusive player endpoints are implemented locally.
- Performance reports include bounded browser/OS/display/media-capability and
  actual renderer/GPU details, plus `rasterSizing`. Data comes from the existing
  renderer, without another adapter/context or a pixel readback.
- Keep the Activity performance icon; its dimensions, icon and padding are
  aligned with Static/Motion. Reports remain copyable using the shared CopyButton.

## Validation status — not a finished batch

Already passed in focused runs:

- Video policy, standalone sessions, preview runtime/player/pool and editor
  presence hook checks across the recorded affected reruns.
- Environment-report validation, immutable copy and performance-panel tests.
- Lazy preferences, native entry controls and startup loader checks.
- **18 tests** for ExactCanvasTarget, DrawingDensity and EditorScene.
- Foreground-admission/runtime tests and affected export behavior checks.
- Latest MagicSearch, Studio and preload checks passed after adapting meaningful
  tests to lazy content and virtualized shortcut rows.

Last integrated focused run: **35 passed, 2 failed in `apps/web/test/App.test.tsx`**
after the latest lazy editor-chrome split:

1. The effect-on-unselected-layer check accesses a layer button before the lazy
   sidebar is ready.
2. The assembled-editor check waits for the Properties region but times out at
   one second. Investigate real rendering vs unit import/setup overhead before
   changing anything; do not simply increase timeouts or weaken assertions.

Still required:

- Fix/understand those App regressions and rerun the affected checks.
- Final scoped TypeScript, oxlint, React lint, formatting and **zero violations
  from `bun run check:rules` before committing**.
- Rerun native `library-player.spec.ts`, `composition-performance-ui.spec.ts` and
  `studio-entry-link.spec.ts`. Earlier browser issues were a duplicated screenshot
  selector and real icon CSS specificity; fixes need the final native rerun.
- Verify `test/browser/preview-density.spec.ts` for zoom, changed DPR, exact output,
  PNG comparison, root render counts and readback counters.
- Run the relevant bounded **50-image / 100-effects** workload in
  `test/browser/performance.spec.ts` for the changed canvas-target subsystem.
- Reprofile only the boundaries affected by further changes. Measure first canvas
  and full usable interface separately; inspect actual dimension writes and GPU
  backend instead of inferring them from launch flags.

Local helper configs/logs:
`artifacts/video-stress/ui-playwright.config.ts`, `backend-tsconfig.json`,
`critical-path-unit.log`, `resize-unit.log`, `startup-pipeline-unit.log`.

## Git, ownership and resource constraints

At handoff creation, observed HEAD is **`c6799e2`**, following `0fc0ca6` and the
previous pushed video-investigation milestone `4b3697a`. Another conversation has
advanced this shared workspace. **The local changes described here have not been
committed or pushed as a completed batch.** Recheck current state and the remote
rather than assuming all of main has been synchronized.

There is substantial unrelated work in the working tree, including history,
spatial and optimization files. Do not use `git add -A`, reset it, or stage another
conversation's changes. Own-path lists are recorded locally in:

- `artifacts/video-stress/backend-owned-files.txt`
- `artifacts/video-stress/performance-owned-files.txt`
- `artifacts/video-stress/startup-owned-files.txt`
- `artifacts/video-stress/validation-owned-files.txt`

Refresh those lists for later edits. `CHANGELOG.md` contains mixed work: stage
only the relevant English entries. The user previously authorized pulling and
pushing main after completion; that is not permission to push failing checks or
foreign unfinished work.

Follow `docs/performance/protocol.md`: serial heavy checks, a quiet native GPU
slot, bounded low-priority workers, no swap for disposable runs, and stop on memory
pressure. Another Codex conversation ran scene browser tests concurrently during
part of the investigation; its processes were not killed. Preserve the user's
request not to overload their CPU or interfere with their normal browser/server.

## Suggested order for the next conversation

1. Inspect this handoff, current diffs and outstanding validation. Stabilize the
   existing local changes before adding another broad renderer refactor.
2. Inventory landing showcase and mascot call sites. Separate live authoring
   previews from public marketing media and genuinely static branding.
3. Implement landing posters/clips and a generic image/animated-SVG mascot facade
   with smooth activation and correct cache/version identity.
4. Evaluate path simplification against actual poses and rendered contour fidelity.
5. Measure cold landing appearance, mascot readiness, Try Melt → dashboard,
   first canonical canvas and full interface readiness independently.
6. Complete focused native/static checks, update English changelog/docs, then
   commit verified milestones deliberately and synchronize main safely.

## November 1 resumed work

The user resumed optimization and specifically prioritized the actual Open in Melt
button and loader stutters. Landing showcase videos are now supplied by the user;
do not spend this pass replacing them. See `studio-startup.md` for the resumed
measurements, failed comparison limits and implemented scheduling changes.

A separate user-authorized public repro now lives in sibling `../VideoBlackFlash`,
[GitHub](https://github.com/ExtraBinoss/VideoBlackFlash),
[Pages](https://extrabinoss.github.io/VideoBlackFlash/). The local server is on
port 5500. The short standalone native run did not reproduce the flash.

New preference: use top-level `import type` declarations; do not introduce inline
`import("module").Type` annotations.

Final resumed verification: four lightweight native browser cases, the exact
zoom/DPR PNG comparison and the 50-image/100-effect workload pass. The new quiet
Open in Melt capture is 3,120 ms to the canonical frame and 3,463 ms to Properties,
with zero pixel reads. It is not a controlled speedup against the differently
configured earlier sample. Native validation cleanup and explicit heap budgets
resolved the larger test's memory-pressure problem. Refer to `studio-startup.md`
for the full conditions and retained failure evidence. Static checks and Git
synchronization are completed separately at the end of the resumed milestone.
