# Search palettes, compact fonts and scene previews

Verified on November 6, 2026 against real Studio Starter compositions in Classic
and Studio. This report distinguishes entrance stability, editor render isolation,
native input response and actual GPU preview readiness.

## Changes and ownership

Quick Add opens at a blank canvas/artboard double-click, including the designated
background paint, without intercepting double-click editing on artwork. Its virtual
anchor is updated before opening. It exposes the existing typed command registry,
localized categories and the same imperative typewriter as Cmd+K. Native imports,
asset-library handoff and document edits retain their original command paths.

`PalettePanel` supplies an opacity-only CSS shell (one initial RAF, no JavaScript animation loop). `PaletteReveal` supplies the shared
2 px/160 ms glyph blur with 0–64 ms stagger. There is no text scale or translation.
A local Jotai opening atom changes once on first search/category interaction;
subsequent results allocate no entrance animation/listeners. A store-local catalogue
and weak, bounded translation/availability caches are reused across both searches.
Advanced Studio properties and scene settings reuse the panel with whole-surface
blur; retained React Activity owners restart the entrance after resuming effects.
Reduced motion skips the decoration. Radix still owns native focus and modal rules.

Fonts use a 312 px popover, 64 px row pitch and one overscan row. Usable catalogue
metadata survives reopening. Pointer intent may warm metadata after 120 ms, with
cancellation before the timer fires; it does not prepare source fonts. Visible
samples retain actual FontFace readiness and bounded cache leases. The immutable
initial loading object prevents an unnecessary second initial row commit.

Scene cards show an immediate static neutral SVG reference rather than a blank
icon tile. Hover renders real gray objects at different depths, with lighting and
reflective surfaces. The loading ring ends only after a real acknowledged frame.
Only thumbnail time is compressed to at most 1.6 seconds, mirrored at endpoints;
authored preset durations/channels, document history and export are unchanged.
The existing single retained 24 fps session, 96 MiB budget and visibility cleanup
remain in charge. Camera/environment headings use local compact spacing.

## Environment and reproducibility

Production JavaScript and matching maps are retained at
`artifacts/quick-add-search-profile-native-css-measured-dist/`; the final delivered
build is `artifacts/quick-add-search-profile-dist/`. A later reduced-motion CSS
specificity correction changes no normal-motion timing path. The source commit, patch, untracked-file
manifest, build log and exact commands are under `artifacts/quick-add-search-profile/`.
A commit alone does not identify this dirty-worktree executable. The archived
pre-compact font build is `artifacts/quick-add-search-profile-before-dist/`.

Chrome for Testing 156.0.8078.4, Linux 7.2.13-200.fc44.x86_64, 1600 × 1000,
DPR 1; the actual WebGPU adapter reports Intel `xe-lpg`, fallback false. Native
cohorts run serially at low priority with CPU quota 200%, MemoryHigh 3000 MiB,
MemoryMax 3500 MiB, swap disabled and Node heap 768 MiB. This shared workstation's
OS/browser caches and unrelated foreground activity are not controlled lab inputs.

The production preview uses port 4178. Playwright's automatic DOM/trace snapshots
are disabled for timings: earlier diagnostic cohorts showed their snapshot walking
inside the CPU profile. Raw latency is measured before a separate CDP CPU/timeline
trace. Invalid/previous experiments and their failures are preserved, not silently
mixed into the final cohort.

## Measured boundaries

Six native openings per search surface include the first cold opening, five warm
openings and typing `blur`, `text`, `hand`, `contrast`, `zoom`, `zzzznone` at 15 ms
per character. Useful entrance means shell and first result opacity exceed 0.1,
followed by another observed RAF. Fresh results require the exact committed query
and no pending state. These are browser presentation opportunities, not physical
display timestamps, INP or GPU execution time.

| Surface           | Cold useful entrance (ms) | Warm median (ms, n=5) | Fresh results p95 (ms, completed inputs) |
| ----------------- | ------------------------: | --------------------: | ---------------------------------------: |
| classic-quick-add |                     194.4 |                  86.1 |                             44.9 (19/32) |
| classic-cmdk      |                     182.2 |                  97.9 |                              61.1 (7/32) |
| studio-quick-add  |                     190.2 |                  72.3 |                             43.0 (18/32) |
| studio-cmdk       |                     357.2 |                  81.2 |                              55.3 (6/32) |

Raw reports retain every input, including superseded queries; the last column uses only completed fresh-result observations, not input echo or discarded samples.

All four cases preserve the five actual React counters: App, Inspector, CanvasArea,
EditorCanvas and EditorScene. Actual GPU/WebGL/Canvas2D/video-frame read probes
remain zero. This establishes isolation of those surfaces, not zero local React
work: changing queries/rows and real asynchronous readiness still update their
own leaves. Cold openings remain measurable and slower than warm openings.

The compact font cohort uses one selected Raleway layer, four openings, native
20 ms typing for Raleway/Tinos/Pacifico and sixteen wheel attempts. The baseline
harness initially queried unrelated hidden local-select listboxes; that timeout
is retained, and the corrected selector names the actual Fonts listbox.
The candidate panel is 312 × 378 px, with 62 px button height/64 px pitch and six
mounted rows. No geometry repair is needed. Its real font work is reported
separately from list appearance; browser decode and native canvas presentation
remain different milestones.

| Font cohort | Cold second RAF (ms) | Warm second RAF (ms) | Key echo median / p95 (ms) |
| ----------- | -------------------: | -------------------: | -------------------------: |
| baseline    |                 86.6 |   31.0 / 29.9 / 30.4 |                11.7 / 18.9 |
| candidate   |                 79.3 |   51.8 / 81.4 / 88.0 |                11.5 / 28.7 |

The candidate also explicitly checks useful panel opacity > 0.1: 109.2 / 61.4 / 95.5 / 96.9 ms across the four openings. The old font baseline did not record that opacity boundary; its second RAF is not an equivalent visibility claim.

The archived font baseline is headless; the final candidate uses a visible window.
These are descriptive workstation observations, not a controlled speedup comparison.

No general opening/typing speedup is claimed from this small font cohort. The
verified gains are compact footprint, stable text size, bounded rows/work, retained
metadata and removal of the duplicate initial sample commit. Both cohorts retain
zero global editor commits and zero production pixel reads.

## Compositor and native rendering witnesses

`palette-compositor.spec.ts` runs a visible Chrome for Testing window. It samples
actual Range glyph coordinates during entrance and after layer retirement, records
Chrome compositing reasons, and captures browser frames during an intentional
300 ms JavaScript task. A separate inspection page decodes/crops those captures;
its pixel reads are outside production accounting. This checks independent
animation progress, not a physical FPS guarantee.

| Surface   | Maximum glyph movement (px) | Captures during 300 ms block | Changed pixels in panel crop |
| --------- | --------------------------: | ---------------------------: | ---------------------------: |
| quick-add |                           0 |                            9 |                        56660 |
| cmdk      |                           0 |                            9 |                       146800 |

Chrome reports active accelerated opacity/filter animations. Both the shell and
row entrances now use native CSS timelines; Motion retains dialog exit presence.
The blocking witness runs on a second opening after the first paint, independently
from earlier DOM/layer inspection. The final Quick Add run also verifies live
reduced-motion switching and native scene-heading layout.

`scene-preset-catalogue.spec.ts` opens the actual Studio scene settings and hovers
Orbit, Push and Environment Turn. Static references are immediately present;
subsequent screenshots must differ in actual rendered pixels, not just timestamps.
The project and editor React counters remain unchanged while hovering.

| Scene preset           | Native hover → canvas (ms) | Component → acknowledged frame (ms) |
| ---------------------- | -------------------------: | ----------------------------------: |
| scene-camera-orbit     |                      486.3 |                               472.0 |
| scene-camera-push      |                       38.0 |                                13.1 |
| scene-environment-turn |                      216.7 |                               201.3 |

The initial native renderer/environment preparation is still substantially slower
than reuse. The immediate reference/loading state makes this visible; it does not
pretend the GPU frame is ready. No production readback or idle thumbnail renderer
is introduced. A separate native font witness verifies real face samples, canvas
preview/cancel, apply and undo pixels. Quick Add verifies native file selection,
focus handoff and a single undo entry.

## Focused verification

The retained logs record focused unit/lifecycle tests, scoped strict TypeScript,
scoped type-aware/React lint, formatting, build and the zero-violation repository
rules check. Native scenarios cover Classic/Studio search, first anchor placement,
category changes without reloading animation, reduced motion, shared scene headers,
font footprint/readiness and real scene motion. Follow [the shared protocol](protocol.md)
to reproduce with the same limits; do not describe compositor evidence as proving
that search, font decoding or all application logic runs on the GPU.
