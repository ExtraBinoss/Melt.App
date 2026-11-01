# Paint mode interaction follow-up

## Supplied Chrome trace

`Trace-20261101T175615.json` records repeated background Solid/Gradient changes on a Vite development editor. Warm click-to-presentation durations are 409, 475, 377, 360 and 420 ms; click handling accounts for 274–397 ms. A repeated unchanged-value click takes 5.858 ms. These are trace EventTiming values, not physical display measurements.

The first 3.258-second task is a separate artifact: `CpuProfiler::StartProfiling` consumes 3.253 seconds after interrupting `ThumbnailActivity.quiet`. Sampling the interrupted JavaScript frame wrongly makes the activity handler appear responsible. Its notifier accounts for only about 0.17 ms of sampled time. No thumbnail activity change is warranted by that event.

For subsequent warm long tasks, native `console.run`/`console.createTask` self time contributes approximately 69–75% of sampled task time. Parent stacks include React development `runWithFiberInDEV`, JSX `getTaskName`, passive effects and component render instrumentation. The attached React DevTools extension additionally forces 5–24 ms of style/layout work per task through `measureHostInstance`. This recording does not identify a separate export-select/close interaction or establish a global CSS invalidation problem.

Instrumentation amplifies actual avoidable work. A separate native Chrome profile without the extension still shows layer rows, timeline rows and closed export controls executing after paint-only document publications. Jotai does not automatically narrow engine subscriptions or React props: passing a replacement whole-page/project object still invalidates consumers whose displayed inputs are unchanged.

## Changes and correctness boundaries

- Layer row memoization compares all ordinary props and the actual immutable presentation inputs of its page. Native drag handlers retain their layer-container owner through metadata changes, resolve the current canonical page at each new input, and still reject loads/replaced layers. An already active drag retains its strict concurrent-edit cancellation.
- The engine-backed export toolbar ignores legacy page/revision/selection props it does not consume. Opening the workspace still captures the current document; job progress and dialog state have their own live owners.
- Timeline scene and layer projections share stable consumed inputs. Animations and Keyframes retain unchanged row/clip subtrees rather than passing replacement background-only page objects through their descendants. Selection and editable occurrence actions continue to resolve their live owners.

Focused regressions verify actual row/control function executions through background edit, undo and redo, then invoke selection, visibility, native drag, animation edits and export against the current document. Load replacement must retire the retained source. Native input-to-control/canvas presentation remains the latency boundary; passing render-count assertions alone is insufficient.

Raw traces, CPU profiles and native observations are preserved under ignored `artifacts/trace175615/`. Development/debugger and production measurements must be reported separately; disabling instrumentation is not an application fix.

## Native verification of this change

Two focused Chrome for Testing 156 checks passed against port 6100 with one worker, a two-core CPU quota, 2.5 GiB memory high / 3.3 GiB maximum and no swap, Linux and a 1600 × 1000 viewport. No React DevTools extension or CPU profiler was attached during these interaction samples. The browser adapter was not re-identified during this final run; launch flags do not establish hardware identity.

Six successive native Solid/Gradient activations produced pointer-capture-to-usable-controls opportunities of **77.4, 69.5, 60.2, 75.6, 77.0 and 122.8 ms** (median 76.3 ms). Corresponding new canonical canvas draws were **112.1, 107.5, 77.1, 87.3, 98.4 and 175.1 ms**. The first activation is retained. A second RAF adds a presentation opportunity, not a physical display certificate. These values remain above a single 60 Hz frame; they are not an instantaneous-response claim or a causal comparison with the user's instrumented trace.

The native export regression verifies actual player advance after select activation (72 ms), primary drag choice, non-primary rejection, keyboard choice, trigger-width alignment, unchanged body-lock attributes, modal closure and focus return. This does not establish a new export-close latency improvement; that interaction is not identifiable in the supplied trace.

The separate sampled `native-before.json` / `native-after.json` diagnostic shows unnecessary row/export function bodies disappearing from attribution. Its after sample overlapped another testing browser on the shared workstation, so those sampled intervals are retained as diagnostic evidence and are excluded from comparative speed claims. The final non-profiling native checks above ran after that competing process exited.

## Adjacent control isolation audit

The follow-up audit covered property/effect/mask controls, textures, toolbar/pins/customization, command search, preferences, notifications, desktop/mobile panel ownership and the shared Radix wrappers. It found two additional coarse property boundaries: selected Opacity/Blend controls recreated their field owners, and open effect/mask readers published replacement pages for background/ruler metadata. They now share the Inspector's immutable editing-scope contract and retain their presentation while actions resolve canonical pages. Layer, motion, dimensions, assets, selection and load replacements retain their genuine invalidation/ownership checks.

Toolbar command items retain their own availability identity, so enabling Undo no longer rebuilds unrelated pinned actions or customization metadata. Selection analysis caches immutable artwork/motion/selection inputs; Group/Ungroup use the same eligibility rules as validated layer commands. Keyboard and native drag handlers still read current preferences and execution eligibility. Customizer and texture catalog bodies are genuine child components below Radix presence, keeping unopened work lazy and exit content mounted until the fade finishes.

The texture audit also found a correctness issue: an open picker could retain actionable old layer/effect IDs after its props became disabled or a same-ID document was loaded. Its opening now owns an abortable engine/page/layer/effect/selection scope, and every import, selection, clear or delete checks that scope. Store/catalog allocation is lazy; stale async results cannot mutate a replacement owner.

Preferences, notifications, tool settings and common Radix shells already use local presentation stores or narrow task/engine values. The outer sidebar and motion-dock containers still reconcile genuine document publications, but unchanged property/row/command bodies are protected below them. This audit does not equate a shallow container render with an expensive popover rebuild, nor claim that every possible future interaction is cost-free.

## Integrated checks and contention boundary

The focused code tests passed for row retention, live drag ownership, background scope, selected compositing, effect/mask editing, texture cancellation/ownership and command availability/pinning. Native Angel.exe checks passed after extending the scenario with a background publication while its effect popover is open, a real opacity edit and Undo. Dock customization and right-click/keyboard unpin paths passed. The unpin witness now waits for the real lazy toolbar before capturing its baseline; previously it recorded zero controls before mounting and later compared that with five mounted controls.

TypeScript, ESLint, Oxlint, version consistency and the rules check passed on a frozen copy of `022cc86` plus the owned UI paths recorded in `artifacts/trace175615/owned.txt`. Rules reported zero violations. Workspace dependency links were reproduced in that copy so in-progress unrelated effects in the shared checkout did not enter this validation. A focused repeat checked the final external-store reader factory and drag diagnostics callback after lint corrections. No repository-wide coverage, release build or broad application suite was run.

An additional final paint-mode witness passed, with control opportunities of **162.0, 105.5, 146.4, 95.2, 149.5 and 79.8 ms**, and new draws at **232.9, 144.1, 217.9, 146.7, 198.2 and 112.8 ms**. A concurrent Remotion/Chrome headless render was observed on the workstation during this cohort. These raw observations are preserved in `native-final-paint.log`; they are contention evidence, not an isolated before/after benchmark. The separate earlier 76.3 ms median must not be substituted for this final sample or presented as a guaranteed result. Structural isolation is verified; a consistent single-frame development interaction has not been established.
