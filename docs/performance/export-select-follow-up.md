# Export selects and Inspector selection: follow-up

The previous `3886b8c` change did **not** remove the reported stutter. The supplied `Trace-20261101T155812.json` confirms four opening pointer handlers at 254.7, 319.9, 295.7 and 396.5 ms. Their thread CPU times are also large; this cannot be explained as a GPU-only problem. The recording includes React development/debug task instrumentation and React DevTools measurements, so its totals must not be presented as production timings.

## Changes

- The shared choice field uses genuine Radix Popover and roving focus. Initial focus waits for the layout frame; it no longer redirects focus while menu layout is still being established. Checked marks do not mount their own Presence/controller tree.
- Plain menus with at most 32 options prepare at React Activity's hidden priority and retain their tree. Hidden effects, focus scopes and observers are deactivated. Large/rich catalogs stay lazy. Owner generation changes discard retained options; the trigger stays stable. Native keyboard, disabled choices, primary drag release, secondary-button rejection, cancellation and exact trigger width remain covered.
- The shared media player paints clock progress and accessible values imperatively. Previously its descendant Radix slider committed React on each clock update despite the parent remaining unchanged. A Profiler regression wrapping the whole player reproduces four frame commits before the fix and zero afterward. The Radix input model synchronizes from the canonical clock in the capture phase before keyboard or pointer seeking. Endpoint and interpolation styling remains shared.
- Engine-scoped foreground reservations defer optional thumbnails while export settings/preview are active, and while Inspector properties are pending. Explicit foreground image previews remain admissible. Starting an export releases the settings reservation; nested reservations and unmount release are reference-counted and tested. The visible preview is not frozen for the lifetime of a menu.
- Inspector selection used unconditional background deferral: its outline and properties followed different publication paths. A cancellable two-RAF publication preserves the outline's first paint, then publishes the latest properties without prolonged background-lane starvation. Same-owner edits remain immediate; attachment editing keeps its existing owner guards. Layers/Search retain their previous policy.
- Hidden keyframe diamonds no longer construct their Tooltip/Button/SVG tree or observe motion frames. One refcounted engine-scoped mode/details visibility source replaces repeated hidden work. Visible key authoring, disabled state and tooltips keep their original behavior.

## Native evidence

Initial source base is `de2d3a3` plus this follow-up. Diagnostic artifacts, raw samples, source preimages and CPU profiles are ignored under `artifacts/select-stutter/` and `artifacts/inspector-selection/`. Runs were serial, low priority and bounded to two CPU cores with no swap. Main interactive checks use **Google Chrome for Testing 156.0.8078.4** on Linux, Intel Xe-LPG, viewport 1600 × 1000, DPR 1. The supplied recording reports DPR 1.25. Development builds and the CPU cap affect the observed durations.

The initial isolated development baseline for eight export-menu openings measured visible-RAF medians of 128.8 ms playing and 104.0 ms paused. Removing per-frame player commits alone did not reliably fix opening latency; that experiment is retained rather than represented as success. After retained menus and admission changes, the main/6100 Chrome-for-Testing samples were:

| Phase   | Input → first visible RAF, ms |
| ------- | ----------------------------- |
| Playing | 112.6, 114.2, 72.2, 58.4      |
| Paused  | 93.3, 63.6, 47.8, 48.0        |

The main cohort made zero native canvas snapshot calls during these interactions. It uses the actual current code, but is not an isolated causal comparison against the earlier server: main has its normal font serving and other local presentation work. A visible RAF/second RAF is a presentation opportunity, not a physical display timestamp or INP. These samples still contain cold/opening cost; they do **not** prove universally stutter-free menus.

For the 150-layer AFTERHOURS selection fixture, the original Inspector appeared 25–34 RAFs after the outline. Making the entire Inspector synchronous was rejected because it delayed the outline too. The bounded publication keeps the outline at RAF 1 and properties at RAF 3. After hidden-diamond elimination, measured outline/properties times were cold text 77/799 ms, group 37/134 ms and warm text 44/344 ms. The preceding bounded version measured 85/543, 29/310 and 91/745 ms respectively. Warm text and group improved; cold text remained noisy and expensive. **Cold Inspector construction is not solved.** Counting frames alone would hide that remaining main-thread cost.

## Verification boundaries

Focused tests cover player descendant commits, precise keyboard/cancel ownership, native forms, hidden menu activity, stale popup owners, visibility subscription cleanup, Inspector scheduled-owner cancellation, attachment retention and foreground/background admission. Native checks use genuine pointer/keyboard input on the animated export, including exact seek endpoints and progress after restart.

The synthetic two-second tool-video interpolation case failed both with the new player and with its original source restored: its sampled video clock remained stationary for the observation window. That existing decoder/clock witness failure was preserved, not fixed by weakening the assertion. The actual export player/audio witness passed. The static download witness passed on stable main/6100, preserving the active design and decoding the delivered image; an earlier run invalidated by HMR remains a failed experiment.

## Second supplied recording and foreground-clock correction

`Trace-20261101T164551.json` confirms the remaining failure. Five click tasks are 1198.3, 795.5, 1016.6, 980.5 and 585.5 ms; later select pointer tasks reach 166.3 ms. Main-profile attribution must filter profile ID `0x10`: worker profiles have separate IDs, and combining their node IDs yields invalid attribution. Most synchronous input cost is React development async-task/debug work; canonical edits rebuild Inspector, spatial controls, layer rows and timeline rows. This is evidence of excessive UI work, not proof that the GPU is responsible.

A separate deterministic cause was found in the export foreground preview: `MotionExportPreview` supplied the global UI-entrance gate to the render preview. Each select acquires that 250 ms gate and animation events extend it; the renderer then cancels its scheduled frame and holds its clock. Thus an inexpensive menu could still visibly stop playback. The export preview no longer receives this optional-work gate. Initial dialog admission still waits for its actual entrance; thumbnails still yield; explicit pause/export/disposal remain unchanged.

Unchanged shared select option JSX and choice callbacks now stay stable across opening, while live owner/session guards are retained. Background gradient controls also retain unchanged editor JSX and exact authored paint identity, avoiding repeated stop/control construction on Solid/Gradient returns. Native clock continuity is checked while an export select is open, not inferred from React counters.

### Background paint priority and measurement correction

A concurrent deferred-presentation experiment for background-only layer/timeline changes was rejected. Its cohorts did not establish a consistent warm-latency benefit, and retaining raw old pages risks transient rejection by existing exact-page action guards. Canonical selection/action correctness takes priority; a proper narrow read model with fresh interaction bindings is still needed for these rows. No background-only deferred hook is delivered.

The spatial controls retain their memoized scene view when scene settings are unchanged. A small live binding still requires the exact current page/selection and retires callbacks on loads or settings replacement; interrupted drafts reset and late commits are rejected. Scene animation actions retain exact live pages through their narrow context boundary. Only a bounded background gradient editor prepares at hidden Activity priority, without active effects; arbitrary layer editors remain lazy.

Earlier exploratory color-mode cohorts called the full cloning automation snapshot inside each measured RAF. That violates the sampling protocol and adds avoidable probe cost; their 763/197 ms figures are **not** a reliable application-only comparison. The final witness reads only local DOM and acknowledged canvas revision markers during input, and checks the canonical document once outside the measured interval. Samples are presentation opportunities rather than physical screen timestamps. The export input-to-first-actual-clock-advance witness separately measured 65.1 ms after removing the menu gate, and 74.4 ms in a subsequent run. These results do not establish zero overhead for all menus.

The corrected final main/6100 cohort (same capped Chrome-for-Testing environment) passed native mouse/keyboard, exact trigger width, primary drag, secondary-release rejection, focus restoration and clock-continuity assertions. First actual export-clock progress arrived 40.9 ms after native pointer input. Corrected Angel Solid/Gradient control opportunities were 268.0, 223.4, 454.6, 175.7, 397.9 and 190.1 ms; acknowledged draw opportunities were 334.2, 276.7, 518.3, 231.1, 476.9 and 225.1 ms. **Background mode latency remains unresolved.** The caching and ownership changes must not be represented as a complete fix for that path. A separate focused CPU profile follows this verified milestone; those samples still include the rejected row-deferral experiment and do not describe the final source.
