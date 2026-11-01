# Applied effect opening and playback dock deadlines

## Reproduction and causes

The target is the existing CRT effect badge in Terminal Signal while the composition plays, not the Add Effect catalog. Chrome for Testing 156 on Linux reproduced a 657 ms first-frame gap and 200–235 ms reopening gaps with the CPU profiler enabled. Its attribution includes synchronous React control construction (`renderRootSync`: about 314 ms cold), initial field subscriptions/layout work, and unchanged animation context menus rebuilt by the layer-selection publication. Profiling overhead is included in those diagnostic figures.

The fix admits the actual Radix surface and focus first. `AttachmentBody` defers only the initial control mount using React's cooperative rendering, with the existing branded dots pending state and an opacity reveal. There is no fixed preparation delay or fabricated completion. Each opening keeps its generation and stale-owner guards; closure discards pending work and completed gestures retain their ordinary immediate updates. An estimated bounded pending height avoids starting large effect forms as a tiny empty popover. Actual controls still take time to construct, particularly on the first selection.

Unchanged `AnimationBlock` trees now retain their controls when selecting an unrelated effect layer. A regression witnesses the real summary-control function calls, rather than inferring isolation from DOM identity.

Scalar `getEffectParameter` reads no longer construct the complete settings-default map and merge all settings for every field and transport tick. They read the authored key, then definition defaults, then the parameter default. Own-property checks preserve explicit undefined overrides and the existing missing-value error. Gradient retains its legacy normalization. Catalog-wide parity tests cover normal and sparse settings, authored overrides, zero and false. No shader, GPU resource or pixel-read path changed.

## Native observations

Both unprofiled local witnesses used one Chrome worker, a two-core CPU quota, 2.5 GiB memory high / 3.3 GiB maximum, no swap, a 1600 × 1000 viewport at DPR 1, and Vite development mode. The renderer reported Three WebGPU; adapter identity was not recorded, so these are UI observations, not GPU throughput claims. A dedicated development server avoided the shared server's restarts. The baseline server overrode only the applied-effect component and scalar getter with their pre-change sources. Unrelated shared-checkout activity remains a limitation of workstation timing comparisons.

| Pointer capture to next observed state |     Cold | Reopen 1 | Reopen 2 |
| -------------------------------------- | -------: | -------: | -------: |
| Before: surface and controls           | 383.8 ms | 114.4 ms | 223.7 ms |
| After: surface                         | 243.8 ms |  46.2 ms |  31.5 ms |
| After: controls available              | 628.6 ms | 232.2 ms | 156.1 ms |
| After: largest observed RAF gap        | 243.8 ms |  46.2 ms |  51.3 ms |

These are DOM/RAF presentation opportunities, not physical display latency or an INP percentile. Cooperative mounting improves the visible response and lets frames run while controls are prepared; it does **not** establish instantaneous control availability. The extra unchanged-animation memo was added after this timing witness and verified by its focused execution/action regression, without assigning it an unmeasured timing gain.

An interleaved Bun diagnostic performed 28,000 CRT settings reads per sample. Complete settings resolution took 140–400 ms; scalar reads took 0.75–2.55 ms across five ordered pairs, including the first sample. This isolates the getter operation and is not an end-to-end application speedup. Raw observations and source overrides remain in ignored `artifacts/applied-effect-open/`.

## Timeline during playback

The dock's global mutation observer also sees the continuously updated playback counter. Its callback previously cleared and restarted the 100 ms reveal / 90–280 ms departure timer, even when the intent was unchanged. Continuous playback could therefore prevent both reveal and automatic closing.

The controller now preserves one earliest deadline for an unchanged open/close intent. Changed intent, pin/focus ownership, pointers, native drag, dismissal and disposal still cancel it; a genuinely faster exit may shorten it. A fake-clock regression updates the DOM every 16 ms while verifying reveal, closing and complete timer cleanup. Native Terminal Signal playback repeats bottom-edge reveal and departure twice without pinning and without document mutations; gentle ruler/play approaches remain stationary.

Focused tests cover scalar parity, effect editing/Undo/cancellation, unchanged animation lanes and dock ownership. Three native paths passed: applied CRT opening/edit/Undo/reopen during playback, gentle peek intent, and unpinned Terminal Signal playback reveal/auto-hide. Setup failures caused by shared-server termination or fixture relocation never reached effect activation and are excluded from the timing tables. Native fixtures use the canonical template loader rather than assuming a public-file layout. No broad application suite, coverage gate or production-latency claim is included.

Focused TypeScript, ESLint, Oxlint, workspace-version and rules checks passed on a frozen `7a77402` plus the owned paths recorded in the artifact directory; rules reported zero violations. This kept concurrent template-layout and renderer edits out of the code-check cohort. The extra pending-body lifecycle test verifies that an inactive opening mounts no editor, an admitted editor remains during its exit, and a new opening cannot inherit the old body.
