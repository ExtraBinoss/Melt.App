# Coordinator validation results

All seven scoped tasks passed coordinator review and verification. Their idea
and checklist pairs are archived under `validated/`; no completed task remains
active. Implementation was delegated one task per owner. Only `/root` ran tests,
reviewed integration and approved archival; production fixes stayed with owners.

## Passing evidence

| Area                          | Actual result                                                                                                                                                                                                                       | Ignored log                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Classic affine hierarchy      | Four decoded native hierarchy cases pass on WebGPU/WebGL, including shear/reflection, masks and undo.                                                                                                                               | `native-integrated.log`                                   |
| Opacity/depth scopes          | Native alpha/group/context/mask and directional/point shadow cases pass on both backends.                                                                                                                                           | `native-integrated.log`                                   |
| Reflection admission          | A 258,480-triangle GLB omitted from capture still receives neighbour reflections with original/override materials; all four backend/material combinations pass.                                                                     | `native-03-07-corrected.log`, `native-final-scene.log`    |
| Material/dependency work      | Four sources require 12 material synchronizations; twelve require 36; sibling color passes synchronize zero materials. Both backends pass. Local recolors reuse unrelated sources; scene reflections recapture dependent receivers. | `native-integrated.log`, `native-03-07-corrected.log`     |
| Effect surfaces               | Four surfaces / 30,720 bytes remain stable over 50 warm alternating sizes. Native creation/destruction/disposal deltas and decoded RGBA differences are zero; both backends pass.                                                   | First two cases of `native-05-final-load.log`             |
| Local transactions and Motion | Related integration initially passes349 checks; an independently reproduced stale baseline assertion is corrected with exact descendant timing checks. Affected follow-up passes70. Signature/interner regressions pass 26.         | `unit-06-07.log`, `followup-code.log`, `static-final.log` |
| Final scene controls          | All 16 focused authoring, sampled controls, Auto-key and cancellation checks pass.                                                                                                                                                  | `unit-07-final.log`                                       |
| Final renderer regressions    | All 59 checks in nine files pass, including pool ownership, captures, real native NodeFrame light scheduling, cloning and cleanup.                                                                                                  | `unit-final-render.log`                                   |
| Final native integration      | All seven scenarios pass: same-task light sampling, Inspector key gestures/cancellation, two decoded nine-frame scene-only videos, dense GLB reflection receivers, native source exports, inline gizmos and grouped gizmo undo.     | `native-final-scene.log`                                  |
| Fifty-image workload          | Complete 50-image / 100-effect scenario passes: updates, strict idle, full PNG export, save/recovery and persisted thumbnail.                                                                                                       | `native-05-validated-load.log`                            |
| Static gates                  | Core and affected-root strict TypeScript, type-aware Oxlint, ESLint and format pass; zero rule violations; all workspaces 0.2.0.                                                                                                    | `final-static.log`, `final-static-rest.log`               |

These cohorts overlap and must not be added into a unique test total. This is
focused verification, not repository-wide coverage or the full CI/release gate.

## Workload and environment

Linux, Headless Chrome 156, 1600×1000 viewport, DPR1, native WebGPU and Three's
WebGL fallback. The fifty-image adapter reports Intel Xe-LPG, fallback=false.
Browser work ran serially with one worker, one logical CPU, low priority, no swap
and a 3,600 MiB hard process-scope limit. The user's development server on 6100 was
preserved. An ignored wrapper froze development reload messages for the final
cohorts; no production latency or physical-display benchmark is claimed.

The complete load fixture has50 images,100 effects, five groups, ten masks and 51
assets. Its decoded PNG is 2400×1500 with 200 sampled colors; the persisted WebP is
768×480 and 65,298 bytes. Warm uploads stay 97 and charged cache bytes stay under
384 MiB. Preview, export, recovery and thumbnail production readback counters are
all zero, and the browser error list is empty. Raw report:
`artifacts/performance-50.json`.

## Findings resolved during verification

- A new cross-effect copy regression exposed cached uniforms belonging to the first effect type. The shared copy graph now owns an independent schema.
- Native Auto-key/undo/redo exposed cancellation restoring an authored base instead of its sampled value. The field now follows the existing sampled NumberInput contract; DOM and native gestures pass.
- Scene-only decoded video exposed stale native light colors between exact samples in one browser frame. Renderer-local native light/node extensions refresh color, intensity and point/spot parameters per render; composition, standalone and reflection paths share the fix. The blue phase now contains 2,450 blue-dominant pixels on WebGPU, with both backends passing.
- The WebGL effect discrepancy came from the witness clearing the last-bound output before canvas presentation. The unnecessary clear was removed; speculative shader/sampler/material-side changes were removed too. Strict decoded pixel/alpha comparisons remain unchanged.
- The first load attempt was invalidated by development reloads, proven by multiple bootstraps and reset revision/render counters. The frozen-client rerun reached a real diagnostic-baseline race: live counters were mixed with throttled snapshots. The settled baseline is now atomic and queue-drained; the one-second strict idle assertions are unchanged.
- Dense-receiver tests now distinguish the single legitimate presentation target from separately charged signature metadata, retaining exact warmed stability and the hard GPU budget. Native hook loading uses canonical static imports, sample counters use their actual per-sample semantics, and endpoint witnesses explicitly request terminal preview.

## Remaining architectural limits

Material preparation is linear in distinct native materials, but depth scope
switches still redraw the reusable depth target. Transparency retains authored
ordering rather than order-independent transparency. Pools intentionally evict
working sets larger than their bounded retention window. Structural/reference
and Motion edits retain conservative full validation.

Scene channels are authored in Inspector controls and existing key commands;
they do not yet have dedicated composition rows in the layer timeline.
Environment asset/preset swaps and scene action blocks are not newly animatable.
Legacy static alpha light colors still import/round-trip; new light-color keys
require RGB. Exact scope and evidence remain in each archived checklist.

## Superseding scene Motion integration

The scene timeline/action limitation recorded for the original seven-task batch is resolved by tasks 08–10. See [the follow-up evidence](scene-motion-validation.md); the original measurements remain historical.
